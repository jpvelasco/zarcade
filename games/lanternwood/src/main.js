// Browser entry: screens, saves, the fixed-step loop, input, sound, dialogue
// and menus. The simulation itself lives in world.js.
import { Game, STEP, ITEMS, ITEM_INFO } from './world.js';
import { Renderer, VIEW_W, VIEW_H } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Autopilot } from './ai.js';
import { loadAll, writeAll, newGame, slotSummary, SLOTS, SAVE_KEY } from './save.js';
import { allAreas, dungeonDef, roomKey } from './areas.js';
import { questLog } from './quests.js';
import { NAMES } from './dialogue.js';
import { drawPortrait, drawItem, makeCanvas } from './sprites.js';
import { frameMonitor } from './perf.js';
import { OVERWORLD } from './data/overworld.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

const telemetry = window.Telemetry || null;
const log = telemetry ? telemetry.log : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

const storage = (() => { try { return localStorage; } catch { return null; } })();
const all = loadAll(storage);
let saveWarned = false;
function persistAll() {
  if (writeAll(storage, all) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const canvas = $('game');
const renderer = new Renderer(canvas, { reducedMotion: reduced });
const input = new Input();
input.bindTouch($('touch'));
const sound = new Sound({ muted: all.muted, music: all.music });
const areas = allAreas();

let mode = 'title'; // title | slots | play | paused | bag | map | down | ending
let game = null;
let slot = -1;
let temp = false; // debug games are never saved
let attract = null;
let autopilot = params.has('autoplay') ? new Autopilot() : null;
let accumulator = 0;
let lastSave = 0;
let dungeonStart = 0;

const SCREENS = ['screen-title', 'screen-slots', 'screen-pause', 'screen-bag', 'screen-map', 'screen-down', 'screen-ending'];

function touchOn() { return coarse || input.mode === 'touch'; }

function layout() {
  const t = touchOn();
  document.body.classList.toggle('touch-on', t);
  const L = renderer.resize(t);
  document.body.classList.toggle('portrait', L.portrait);
  document.body.classList.toggle('landscape', !L.portrait);
}

// The ending and fainted cards ignore clicks for a moment after they appear,
// so a player still mashing through dialogue or swinging doesn't skip them.
const GUARDED = ['screen-ending', 'screen-down'];
const GUARD_MS = 800;
let shownId = null;
let shownAt = 0;
addEventListener('click', (e) => {
  if (GUARDED.includes(shownId) && performance.now() - shownAt < GUARD_MS) { e.preventDefault(); e.stopPropagation(); }
}, { capture: true });

function showScreen(id) {
  shownId = id;
  shownAt = performance.now();
  // Presses made during play (sword, talk, walking) must not replay as menu
  // input: a menu only reacts to presses made while it is open.
  if (id) input.clear();
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  const playing = mode === 'play';
  $('hud-buttons').classList.toggle('hidden', !playing);
  $('touch').classList.toggle('hidden', !(playing && touchOn()));
  if (id) {
    const first = $(id).querySelector('.btn.primary:not([disabled]):not(.hidden), .slot .btn:not([disabled]), .btn:not([disabled]):not(.hidden), .item-slot:not(.locked)');
    first?.focus({ preventScroll: true });
  } else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  sound.setMusicLevel(playing ? 1 : mode === 'title' || mode === 'slots' ? 0.8 : 0.4);
}

// ------------------------------------------------------------ title & slots

function makeAttract() {
  const s = newGame();
  s.time = 0.8;
  s.respawn = { area: 'overworld', x: 1 * 20 + 8, y: 2 * 12 + 7 };
  const g = new Game(s, { seed: 3 });
  g.enemies = [];
  return g;
}

function toTitle() {
  if (game && !temp) saveNow('title');
  mode = 'title';
  game = null;
  attract ||= makeAttract();
  renderer.resetArea();
  const last = all.slots[all.last];
  $('btn-continue').classList.toggle('hidden', !last);
  if (last) $('btn-continue').textContent = `Continue · Slot ${all.last + 1}`;
  $('btn-slots').textContent = last ? 'Adventure slots' : 'Start a new adventure';
  $('btn-slots').classList.toggle('primary', !last);
  $('btn-slots').classList.toggle('big', !last);
  updateSoundButtons();
  sound.setSong('title');
  showScreen('screen-title');
}

function toSlots() {
  sound.unlock();
  mode = 'slots';
  const list = $('slot-list');
  list.innerHTML = '';
  for (let i = 0; i < SLOTS; i++) {
    const s = all.slots[i];
    const sum = slotSummary(s);
    const el = document.createElement('div');
    el.className = `slot${i === all.last && s ? ' last' : ''}`;
    el.innerHTML = `<div class="info"><div class="name">Slot ${i + 1}${sum && sum.ended ? ' ✨' : ''}</div><div class="meta">${sum ? `❤ ${sum.hearts} · 🔥 ${sum.shards}/3 shards · 🫐 ${sum.berries} · ${sum.time}` : 'Empty: a brand-new adventure'}</div></div><div class="actions"></div>`;
    const actions = el.querySelector('.actions');
    const play = document.createElement('button');
    play.className = `btn ${s ? 'primary' : ''} small`;
    play.textContent = s ? 'Play' : 'New';
    play.addEventListener('click', () => startSlot(i, !s));
    actions.appendChild(play);
    if (s) {
      const del = document.createElement('button');
      del.className = 'btn small danger';
      del.textContent = 'Erase';
      del.addEventListener('click', () => {
        if (del.dataset.armed) { all.slots[i] = null; persistAll(); log.event('slot.erase', { slot: i + 1 }); toSlots(); }
        else { del.dataset.armed = '1'; del.textContent = 'Sure?'; }
      });
      actions.appendChild(del);
    }
    list.appendChild(el);
  }
  showScreen('screen-slots');
}

function startSlot(i, fresh) {
  sound.unlock();
  if (fresh || !all.slots[i]) { all.slots[i] = newGame(); all.slots[i].created = Date.now(); }
  slot = i;
  all.last = i;
  temp = false;
  persistAll();
  begin(all.slots[i], fresh);
}

function begin(save, fresh) {
  game = new Game(save, { seed: (Date.now() & 0xffff) || 1 });
  attract = null;
  renderer.resetArea();
  renderer.makeFlies(game);
  mode = 'play';
  accumulator = 0;
  input.clear();
  showScreen(null);
  sound.setSong(game.music());
  layout();
  queueMicrotask(() => monitor.mark(performance.now(), 'area'));
  log.event('level.start', { area: game.area.id, fresh: !!fresh, shards: save.shards.length, hearts: save.maxHearts, slot: slot + 1 });
  if (game.isDungeon) dungeonStart = save.playTime;
}

// Debug: ?area=burrow starts a throwaway game there with the right items.
function debugStart(areaId) {
  const s = newGame();
  const order = ['burrow', 'temple', 'peak'];
  const idx = order.indexOf(areaId);
  if (idx >= 1) s.items.boomerang = true;
  if (idx >= 2) s.items.grapple = true;
  if (params.has('items')) Object.assign(s.items, { boomerang: true, grapple: true, dash: true });
  if (params.has('night')) s.time = 0.9;
  if (areaId && areas[areaId]) s.respawn = { area: areaId, x: areas[areaId].start.x, y: areas[areaId].start.y };
  temp = true;
  slot = -1;
  begin(s, true);
}

// ------------------------------------------------------------ saving

function saveNow(reason) {
  if (!game || temp || slot < 0) return;
  game.syncSave();
  all.slots[slot] = game.save;
  persistAll();
  lastSave = performance.now();
  if (reason === 'statue') log.info('save.checkpoint', { area: game.area.id });
}

// ------------------------------------------------------------ pause, bag, map

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  const r = game.room;
  $('pause-where').textContent = game.isDungeon ? `${game.area.name} · ${r.name}` : r.name;
  updateSoundButtons();
  showScreen('screen-pause');
  saveNow('pause');
}

function resume() {
  if (mode === 'play') return;
  mode = 'play';
  input.clear();
  showScreen(null);
}

function openBag(tab = 'items') {
  if (mode !== 'play' && mode !== 'paused' && mode !== 'map') return;
  mode = 'bag';
  renderBag(tab);
  showScreen('screen-bag');
}

const iconCache = new Map();
function iconCanvas(item, size = 56) {
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  const ctx = c.getContext('2d');
  ctx.scale(size * 2 / 16, size * 2 / 16);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  drawItem(ctx, item);
  return c;
}

function renderBag(tab) {
  for (const t of document.querySelectorAll('#screen-bag .tab')) t.classList.toggle('active', t.dataset.tab === tab);
  $('tab-items').classList.toggle('hidden', tab !== 'items');
  $('tab-quests').classList.toggle('hidden', tab !== 'quests');
  const s = game.save;
  $('bag-berries').textContent = `🫐 ${s.berries}`;
  $('bag-key').textContent = input.mode === 'pad' ? 'X' : input.mode === 'touch' ? 'the item button' : 'K';
  const grid = $('item-grid');
  grid.innerHTML = '';
  const desc = document.createElement('p');
  desc.className = 'item-desc';
  for (const it of ITEMS) {
    const owned = !!s.items[it];
    const b = document.createElement('button');
    b.className = `item-slot${owned ? '' : ' locked'}${s.equipped === it ? ' equipped' : ''}`;
    b.disabled = !owned;
    b.appendChild(owned ? iconCanvas(it) : document.createElement('canvas'));
    const label = document.createElement('span');
    label.textContent = owned ? ITEM_INFO[it].name : '???';
    b.appendChild(label);
    const info = () => { desc.textContent = owned ? ITEM_INFO[it].text : 'Still hidden somewhere in Lanternwood.'; };
    b.addEventListener('focus', info);
    b.addEventListener('mouseenter', info);
    b.addEventListener('click', () => { game.equip(it); sound.menu(); renderBag('items'); grid.querySelector('.equipped')?.focus(); });
    grid.appendChild(b);
  }
  grid.after(desc);
  for (const old of $('tab-items').querySelectorAll('.item-desc')) if (old !== desc) old.remove();
  desc.textContent = ITEM_INFO[s.equipped]?.text || '';
  const ex = $('bag-extras');
  ex.innerHTML = '';
  const pill = (item, text) => { const p = document.createElement('span'); p.className = 'pill'; p.appendChild(iconCanvas(item, 11)); p.appendChild(document.createTextNode(text)); ex.appendChild(p); };
  pill('heart', `${s.maxHearts} hearts`);
  pill('shard', `${s.shards.length} / 3 Flame Shards`);
  pill('sword', ITEM_INFO.sword.name);
  if (s.tea) pill('tea', 'Fairy Tea');
  if (s.pouch) pill('pouch', 'Big pouch');
  if (game.isDungeon) {
    pill('key', `${s.keys[game.area.id] || 0} small keys`);
    if (s.bigKeys[game.area.id]) pill('bigkey', 'Big Key');
  }
  const ql = $('quest-list');
  ql.innerHTML = '';
  for (const q of questLog(s.quests)) {
    const li = document.createElement('li');
    li.className = `${q.main ? 'main' : ''} ${q.done ? 'done' : ''}`;
    li.innerHTML = `<div class="qt">${q.done ? '✓ ' : q.main ? '★ ' : ''}${q.title}</div><div class="qx"></div>`;
    li.querySelector('.qx').textContent = q.text;
    ql.appendChild(li);
  }
}

let mapView = 'world';
let mapTick = 0;
function openMap() {
  if (mode !== 'play' && mode !== 'paused' && mode !== 'bag') return;
  mode = 'map';
  mapView = game.isDungeon ? 'dungeon' : 'world';
  renderMap();
  showScreen('screen-map');
}

const REGION_COL = { village: '#7cc463', meadow: '#8ad46c', forest: '#559f52', hills: '#a3c467', lake: '#7fc56f', mountain: '#b9c08e' };
function renderMap() {
  const c = $('map-canvas');
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1d1838';
  ctx.fillRect(0, 0, W, H);
  const dungeon = mapView === 'dungeon' && game.isDungeon;
  $('btn-map-toggle').classList.toggle('hidden', !game.isDungeon);
  $('btn-map-toggle').textContent = dungeon ? 'World map' : 'Dungeon map';
  const area = dungeon ? game.area : areas.overworld;
  $('map-title').textContent = dungeon ? game.area.name : 'Lanternwood';
  const disc = new Set(game.save.discovered[area.id] || []);
  const cw = Math.min((W - 40) / area.cols, (H - 40) / area.rows * 1.66);
  const ch = cw / 1.66;
  const ox = (W - cw * area.cols) / 2, oy = (H - ch * area.rows) / 2;
  ctx.font = '700 15px ui-rounded, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const terrain = mapTerrain(area, dungeon ? game.grid : null);
  for (const room of area.rooms.values()) {
    const x = ox + room.rx * cw, y = oy + room.ry * ch;
    const known = disc.has(room.key);
    if (known) {
      ctx.save();
      rr(ctx, x + 3, y + 3, cw - 6, ch - 6, 10); ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(terrain, room.rx * 20, room.ry * 12, 20, 12, x + 3, y + 3, cw - 6, ch - 6);
      ctx.restore();
      ctx.strokeStyle = dungeon && room.cond === 'boss' ? '#ffb23c' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      rr(ctx, x + 3, y + 3, cw - 6, ch - 6, 10); ctx.stroke();
      ctx.font = '800 14px ui-rounded, system-ui, sans-serif';
      const tw = Math.min(cw - 16, ctx.measureText(room.name).width + 14);
      ctx.fillStyle = 'rgba(20,12,36,0.72)';
      rr(ctx, x + cw / 2 - tw / 2, y + ch - 30, tw, 20, 8); ctx.fill();
      ctx.fillStyle = '#fff8e8';
      ctx.fillText(room.name, x + cw / 2, y + ch - 20, cw - 20);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      rr(ctx, x + 4, y + 4, cw - 8, ch - 8, 12); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillText('?', x + cw / 2, y + ch / 2);
    }
  }
  // Doors between dungeon rooms.
  if (dungeon) {
    for (const link of area.links.values()) {
      const a = area.rooms.get(link.a), b = area.rooms.get(link.b);
      if (!disc.has(a.key) && !disc.has(b.key)) continue;
      const x = ox + (a.rx + b.rx + 1) / 2 * cw, y = oy + (a.ry + b.ry + 1) / 2 * ch;
      ctx.fillStyle = link.type === 'boss' ? '#ffb23c' : link.type === 'locked' ? '#ffd25a' : '#d6c9ef';
      ctx.beginPath(); ctx.arc(x, y, link.type === 'open' ? 5 : 8, 0, 7); ctx.fill();
    }
  }
  const icon = (emoji, rx, ry, lx, ly) => { ctx.font = '22px system-ui'; ctx.fillText(emoji, ox + rx * cw + (lx / 20) * cw, oy + ry * ch + (ly / 12) * ch); };
  if (!dungeon) {
    for (const s of OVERWORLD.screens) {
      if (!disc.has(s.at.join(','))) continue;
      for (const e of s.entities) {
        if (e.type === 'warp') icon(game.save.shards.includes(e.to) ? '✨' : '🏰', s.at[0], s.at[1], e.x, e.y + 1);
        if (e.type === 'statue') icon('🏮', s.at[0], s.at[1], e.x, e.y);
      }
    }
    icon('🔥', 1, 2, 10, 5);
  }
  // You are here.
  if (dungeon === game.isDungeon) {
    const px = game.player.x / (VIEW_W * area.cols), py = game.player.y / (VIEW_H * area.rows);
    const x = ox + px * cw * area.cols, y = oy + py * ch * area.rows;
    const pulse = 6 + Math.sin(performance.now() / 200) * 2;
    ctx.fillStyle = '#ff5a7a';
    ctx.beginPath(); ctx.arc(x, y, pulse, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
  }
  $('map-legend').textContent = dungeon
    ? `${game.save.keys[game.area.id] || 0} small keys${game.save.bigKeys[game.area.id] ? ' · Big Key ✓' : ''} · gold dots are locked doors`
    : '🏮 lantern statues · 🏰 dungeons · 🔥 the Great Lantern · you are the pink dot';
}

// One pixel per tile, coloured by what the tile is. Cached per area.
const TERRAIN = {
  T: '#2f6b3a', '^': '#8a7f74', '~': '#4aa3d8', w: '#4aa3d8', x: '#120d1c', '=': '#a06c3f', '-': '#e2c08a', ':': '#efdca4',
  _: '#d6cdbd', R: '#c95b4a', H: '#f1e2c2', '#': '#3a2d4a', L: '#ffd25a', B: '#ffb23c', S: '#7d7896', g: '#9d98b3',
  r: '#9a96a0', b: '#3f8c45', '|': '#8a5a34', '+': '#1a1220', o: '#9a6a3c', Y: '#ffd25a', t: '#ff9a3c', c: '#6fd8ff', '%': '#b0a08a', O: '#ffd25a', k: '#b07a46',
};
const terrainCache = new Map();
function mapTerrain(area, live) {
  const key = area.id + (live ? ':live' : '');
  let c = live ? null : terrainCache.get(key);
  if (c) return c;
  c = makeCanvas(area.w, area.h);
  const ctx = c.getContext('2d');
  const grid = live || area.base;
  for (let y = 0; y < area.h; y++) for (let x = 0; x < area.w; x++) {
    const ch = String.fromCharCode(grid[y * area.w + x]);
    const room = area.rooms.get(roomKey(Math.floor(x / 20), Math.floor(y / 12)));
    ctx.fillStyle = TERRAIN[ch] || (area.kind === 'dungeon' ? '#6b5f86' : REGION_COL[room?.region] || '#7cc463');
    ctx.fillRect(x, y, 1, 1);
  }
  if (!live) terrainCache.set(key, c);
  return c;
}

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// ------------------------------------------------------------ dialogue & item banner

const dlg = { node: null, shown: 0, full: '', sel: 0, portrait: null };

function updateDialogue(dt) {
  const box = $('dialogue');
  if (!game || game.mode !== 'talk' || mode !== 'play') { box.classList.add('hidden'); dlg.node = null; return; }
  box.classList.remove('hidden');
  const n = game.talkNode;
  if (!n) return;
  if (dlg.node !== n) {
    dlg.node = n;
    dlg.full = n.text;
    dlg.shown = reduced ? n.text.length : 0;
    dlg.sel = 0;
    $('dlg-name').textContent = NAMES[n.who] || '';
    if (dlg.portrait !== n.who) { drawPortrait($('dlg-portrait'), n.who); dlg.portrait = n.who; }
    $('dlg-choices').innerHTML = '';
  }
  if (dlg.shown < dlg.full.length) {
    dlg.shown = Math.min(dlg.full.length, dlg.shown + dt * 55);
    sound.blip();
  }
  const done = dlg.shown >= dlg.full.length;
  $('dlg-text').textContent = dlg.full.slice(0, Math.floor(dlg.shown));
  const ch = $('dlg-choices');
  if (done && n.choices && !ch.children.length) {
    n.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = c.label;
      b.addEventListener('click', (e) => { e.stopPropagation(); choose(i); });
      ch.appendChild(b);
    });
    highlightChoice();
  }
  $('dlg-more').classList.toggle('hidden', !done || !!n.choices);
}

function highlightChoice() {
  [...$('dlg-choices').children].forEach((b, i) => b.classList.toggle('sel', i === dlg.sel));
}

function choose(i) {
  sound.menu();
  game.talkChoose(i);
  afterTalkStep();
}

function advanceDialogue() {
  const n = game.talkNode;
  if (!n) return;
  if (dlg.shown < dlg.full.length) { dlg.shown = dlg.full.length; return; }
  if (n.choices) { choose(dlg.sel); return; }
  game.talkNext();
  afterTalkStep();
}

function afterTalkStep() {
  flushEvents();
}

$('dialogue').addEventListener('click', () => { if (game && game.mode === 'talk') advanceDialogue(); });

let igShown = null;
function updateItemGet() {
  const el = $('itemget');
  const ig = game && game.mode === 'itemget' ? game.itemGet : null;
  if (!ig || mode !== 'play') { el.classList.add('hidden'); igShown = null; return; }
  if (igShown !== ig) {
    igShown = ig;
    $('ig-name').textContent = ig.name;
    $('ig-text').textContent = ig.text;
    const c = $('ig-icon');
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.scale(c.width / 16, c.height / 16);
    drawItem(ctx, ig.item === 'berries' ? 'berry' : ig.item);
    el.classList.remove('hidden');
  }
}

let touchItem = null;
function updateTouchItem() {
  if (!game || touchItem === game.save.equipped) return;
  touchItem = game.save.equipped;
  const c = $('touch-item');
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, 64, 64);
  ctx.scale(4, 4);
  drawItem(ctx, touchItem);
}

// ------------------------------------------------------------ sound buttons

function updateSoundButtons() {
  for (const b of document.querySelectorAll('[data-sound]')) b.textContent = all.muted ? '🔇 Sound off' : '🔊 Sound on';
  for (const b of document.querySelectorAll('[data-music]')) b.textContent = all.music ? '🎵 Music on' : '🎵 Music off';
}
function toggleMute() { all.muted = !all.muted; sound.unlock(); sound.setMuted(all.muted); persistAll(); updateSoundButtons(); }
function toggleMusic() { all.music = !all.music; sound.unlock(); sound.setMusic(all.music); persistAll(); updateSoundButtons(); }

// ------------------------------------------------------------ events → sound, saves, telemetry

let lastArea = null;
function flushEvents() {
  if (!game) return;
  const ev = game.events;
  renderer.handleEvents(ev, game);
  sound.handle(ev);
  for (const e of ev) {
    switch (e.type) {
      case 'room': sound.setSong(e.music); if (e.fresh) queueMicrotask(() => monitor.mark(performance.now(), 'area')); break;
      case 'area':
        if (lastArea !== e.area) {
          if (e.area !== 'overworld') { dungeonStart = game.save.playTime; log.event('level.start', { area: e.area, shards: game.save.shards.length, hearts: game.save.maxHearts }); }
          lastArea = e.area;
        }
        break;
      case 'itemget': log.event('item.get', { item: e.item, area: game.area.id }); break;
      case 'save': case 'checkpoint': saveNow('statue'); break;
      case 'quest': if (!e.quiet) log.event('quest.update', { quests: e.ids.join(',') }); break;
      case 'down': log.event('level.fail', { area: game.area.id, room: game.room.key, hearts: game.save.maxHearts, deaths: game.save.stats.deaths }); break;
      case 'bossdown': {
        const d = dungeonDef(game.area.id);
        log.event('level.complete', { area: game.area.id, boss: e.kind, time: Math.round(game.save.playTime - dungeonStart), hearts: game.save.maxHearts, shards: game.save.shards.length + (e.kind === 'shade' ? 0 : 1), name: d ? d.name : '' });
        break;
      }
      case 'ending': log.event('game.complete', { time: Math.round(game.save.playTime), hearts: game.save.maxHearts, chests: game.save.stats.chests, deaths: game.save.stats.deaths }); break;
      case 'racewin': log.event('race.win', {}); break;
      case 'catch': log.info('fish.catch', { total: game.save.stats.fish }); break;
      default: break;
    }
  }
  ev.length = 0;
  if (game.dirty && performance.now() - lastSave > 1500) saveNow('auto');
}

// ------------------------------------------------------------ wiring

$('btn-continue').addEventListener('click', () => startSlot(all.last, false));
$('btn-slots').addEventListener('click', () => { if (all.slots.some(Boolean)) toSlots(); else startSlot(0, true); });
$('btn-resume').addEventListener('click', resume);
$('btn-pause').addEventListener('click', pause);
$('btn-bag').addEventListener('click', () => openBag());
$('btn-map').addEventListener('click', openMap);
$('btn-pause-bag').addEventListener('click', () => openBag());
$('btn-pause-map').addEventListener('click', openMap);
$('btn-quit').addEventListener('click', toTitle);
$('btn-rest').addEventListener('click', () => { game.respawn(); mode = 'play'; showScreen(null); flushEvents(); });
$('btn-keep').addEventListener('click', () => { game.mode = 'play'; mode = 'play'; saveNow('ending'); showScreen(null); sound.setSong(game.music()); });
$('btn-map-toggle').addEventListener('click', () => { mapView = mapView === 'world' ? 'dungeon' : 'world'; renderMap(); });
for (const t of document.querySelectorAll('#screen-bag .tab')) t.addEventListener('click', () => renderBag(t.dataset.tab));
for (const b of document.querySelectorAll('[data-sound]')) b.addEventListener('click', toggleMute);
for (const b of document.querySelectorAll('[data-music]')) b.addEventListener('click', toggleMusic);
for (const b of document.querySelectorAll('[data-title]')) b.addEventListener('click', toTitle);
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', back);
// Another tab saved: take its slots, so this tab never writes a stale copy over
// them. The adventure being played here keeps its live state.
addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY && e.key !== null) return;
  const fresh = loadAll(storage);
  for (let i = 0; i < SLOTS; i++) if (!(game && !temp && i === slot)) all.slots[i] = fresh.slots[i];
  all.last = fresh.last;
  all.muted = fresh.muted;
  all.music = fresh.music;
  sound.setMuted(all.muted);
  sound.setMusic(all.music);
  updateSoundButtons();
  if (mode === 'title') toTitle();
  else if (mode === 'slots') toSlots();
});
addEventListener('resize', layout);
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); saveNow('hidden'); } });
addEventListener('pagehide', () => saveNow('pagehide'));

function back() {
  if (mode === 'paused') resume();
  else if (mode === 'bag' || mode === 'map') { mode = 'play'; showScreen(null); input.clear(); }
  else if (mode === 'slots') toTitle();
}

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

// ------------------------------------------------------------ loop

let pointerIdle = 0;
addEventListener('mousemove', () => { pointerIdle = 0; });
function updatePointer(dt) {
  pointerIdle += dt;
  document.body.classList.toggle('no-cursor', mode === 'play' && pointerIdle > 2);
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({ mode, area: game ? game.area.id : 'title', room: game ? game.room.key : '', enemies: game ? game.enemies.length : 0, sim: game ? game.mode : '' }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

let last = performance.now();
let lastTouch = null;
function frame(now) {
  monitor.frame(now);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  input.pollPad();
  updatePointer(dt);
  if (touchOn() !== lastTouch) { lastTouch = touchOn(); layout(); showScreenKeep(); }

  // Menu-level keys
  const pauseKey = input.consume('pause');
  const bagKey = input.consume('bag');
  const mapKey = input.consume('map');
  if (mode === 'play' && game && (game.mode === 'play' || game.mode === 'fishing')) {
    if (pauseKey) pause();
    else if (bagKey) openBag();
    else if (mapKey) openMap();
  } else if (mode !== 'play') {
    if (pauseKey || input.consume('back')) back();
    if (bagKey && mode === 'bag') back();
    if (mapKey && mode === 'map') back();
    if (input.consume('up') || input.consume('left')) moveFocus(-1);
    if (input.consume('down') || input.consume('right')) moveFocus(1);
    if (input.consume('confirm') && input.mode === 'pad') document.activeElement?.click?.();
    input.consume('attack'); input.consume('interact'); input.consume('item'); input.consume('cycle');
  }

  if (mode === 'play' && game) {
    if (game.mode === 'talk') {
      const n = game.talkNode;
      if (n && n.choices && dlg.shown >= dlg.full.length) {
        if (input.consume('up') || input.consume('left')) { dlg.sel = (dlg.sel + n.choices.length - 1) % n.choices.length; highlightChoice(); sound.menu(); }
        if (input.consume('down') || input.consume('right')) { dlg.sel = (dlg.sel + 1) % n.choices.length; highlightChoice(); sound.menu(); }
      }
      // One gamepad press sends both attack and confirm: count it once.
      const press = [input.consume('attack'), input.consume('interact'), input.consume('confirm')].some(Boolean);
      if (press) advanceDialogue();
      if (autopilot) { autopilot.controls(game, dt); flushEvents(); }
      input.consume('item'); input.consume('cycle');
    } else if (game.mode === 'dead') {
      if (mode === 'play') { mode = 'down'; showScreen('screen-down'); }
    } else if (game.mode === 'ending') {
      if (mode === 'play') {
        mode = 'ending';
        $('ending-stats').innerHTML = [['Play time', slotSummary(game.save).time], ['Hearts', game.save.maxHearts], ['Treasure chests', game.save.stats.chests], ['Friends made', 'Everyone!']]
          .map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
        sound.setSong('ending');
        showScreen('screen-ending');
      }
    }
    if (mode === 'play') {
      const ctl = autopilot && game.mode !== 'talk' ? autopilot.controls(game, dt) : input.read();
      if (game.mode === 'talk') { ctl.attack = ctl.interact = ctl.item = false; }
      accumulator += dt;
      let first = true;
      while (accumulator >= STEP) {
        game.step(STEP, first ? ctl : { x: ctl.x, y: ctl.y });
        first = false;
        accumulator -= STEP;
        flushEvents();
      }
    }
  } else if (attract && (mode === 'title' || mode === 'slots')) {
    attract.save.time = 0.8;
    attract.step(dt, {});
    renderer.handleEvents(attract.events, attract);
    attract.events.length = 0;
  }

  const shown = game || attract;
  if (mode !== 'paused' && mode !== 'bag' && mode !== 'map') renderer.update(dt);
  const tch = touchOn() && input.mode !== 'pad' && input.mode !== 'keys';
  renderer.draw(shown, { itemKey: input.mode === 'pad' ? 'X' : tch || coarse ? '' : 'K', swapKey: input.mode === 'pad' ? 'RB ⇄' : tch || coarse ? '' : 'Q ⇄', attract: !game });
  updateDialogue(dt);
  updateItemGet();
  updateTouchItem();
  if (mode === 'map' && game && (mapTick = (mapTick + 1) % 12) === 0) renderMap();
  requestAnimationFrame(loop);
}

function showScreenKeep() {
  const playing = mode === 'play';
  $('hud-buttons').classList.toggle('hidden', !playing);
  $('touch').classList.toggle('hidden', !(playing && touchOn()));
}

const loop = telemetry ? telemetry.guard(frame, 'lanternwood.frame') : frame;

function boot() {
  layout();
  // Bake sprites after the first paint so the page shows "Lighting the lanterns" first.
  requestAnimationFrame(() => {
    renderer.prepare();
    $('loading').classList.add('hidden');
    log.event('game.ready', { slots: all.slots.filter(Boolean).length, touch: coarse, reduced });
    const area = params.get('area');
    const slotParam = parseInt(params.get('slot'), 10);
    if (area) debugStart(area);
    else if (params.has('autoplay')) debugStart('burrow');
    else if (slotParam >= 1 && slotParam <= SLOTS) startSlot(slotParam - 1, !all.slots[slotParam - 1]);
    else toTitle();
    last = performance.now();
    queueMicrotask(() => monitor.mark(performance.now(), 'startup'));
    requestAnimationFrame(loop);
  });
}

if (location.protocol !== 'file:') boot();

window.LW = { get game() { return game; }, get mode() { return mode; }, all, renderer, input, sound, startSlot, debugStart, saveNow, roomKey, makeCanvas };
