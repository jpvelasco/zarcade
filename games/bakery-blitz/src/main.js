// Screens, controls and the frame loop for Bakery Blitz.
import { Shift } from './sim.js';
import { buildDay, chapterOf, chapterRange, CHAPTERS, DAY_COUNT, getSpec, starsFor } from './levels.js';
import { RECIPES, STATIONS, CUSTOMERS, BOOK_ORDER } from './recipes.js';
import { BRANCHES, UPGRADES, effects, getUpgrade, isAvailable, upgradesIn } from './upgrades.js';
import {
  applyOrders, assistFor, bankSpecial, buyUpgrade, daysCleared, highestChapter, loadSave,
  meetCustomer, owns, recordDay, refreshDaily, streakAlive, tasteSpecial, totalStars, writeSave,
} from './progress.js';
import { applySpecial, buildSpecialDay, dateKey, specialFor, stationsForChapter } from './daily.js';
import { ShopView, paintCustomer, paintDish, paintSilhouette, paintStation } from './render.js';
import { Sfx } from './audio.js';
import { Pad, PAUSE_KEYS, MUTE_KEYS, SERVE_KEYS, LEFT_KEYS, RIGHT_KEYS, stationFromKey } from './input.js';
import { chooseAction, doAction, PACE } from './ai.js';
import { frameMonitor } from './perf.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Telemetry is optional: the game still runs if telemetry.js is missing.
const telemetry = window.Telemetry || null;
const log = telemetry
  ? telemetry.log
  : { event() {}, info() {}, warn() {}, error() {}, exception() {} };

// Reading localStorage throws when the browser blocks site storage.
const storage = (() => { try { return localStorage; } catch { return null; } })();
const save = loadSave(storage);
let saveWarned = false;
function persist() {
  // ?autopilot and ?demo are browser checks: their days must not land in the real save.
  if (params.has('autopilot') || params.has('demo')) return;
  if (writeSave(storage, save) || saveWarned) return;
  saveWarned = true;
  log.warn('save.failed', { 'storage.available': !!storage });
}

const sfx = new Sfx(save.muted);
const view = new ShopView($('shop'), { reduceMotion });
const pad = new Pad();
const today = params.get('date') || dateKey();

let mode = 'title';
let plan = null;
let shift = null;
let dayId = Math.min(save.unlocked, DAY_COUNT);
let backTo = 'title';
let autopilot = params.has('autopilot') || params.has('demo');
let aiBudget = 1;
let shownCoins = 0;
let lastHudCoins = -1;
let warnedClosing = false;

refreshDaily(save, today, highestChapter(save));
persist();
// The recipe book and the menus show today's special, not the placeholder.
applySpecial(specialFor(today, stationsForChapter(highestChapter(save))));
view.sprites.bakeDish('special');

// ------------------------------------------------------------------ screens

const SCREENS = ['title', 'map', 'shop', 'book', 'brief', 'play', 'pause', 'results'];
// The briefing, the pause menu and the results card sit on top of whatever
// screen you came from, so there is never a black hole behind them.
const OVERLAYS = ['brief', 'pause', 'results'];
let base = 'title';

function show(next) {
  mode = next;
  if (!OVERLAYS.includes(next)) base = next;
  for (const name of SCREENS) {
    const el = $(`screen-${name}`);
    if (!el) continue;
    el.classList.toggle('hidden', name !== next && name !== base);
  }
  if (base === 'play') layout();
  if (next !== 'play') document.body.classList.remove('no-cursor');
}

function layout() {
  const stage = $('stage');
  const rect = stage.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  view.resize(Math.floor(rect.width), Math.floor(rect.height));
}

let titleArtDone = false;
function drawTitleArt() {
  if (titleArtDone) return;
  titleArtDone = true;
  const row = $('dish-row');
  for (const id of ['cocoa', 'pretzel', 'cupcake', 'tart', 'cookies', 'cake']) {
    const canvas = document.createElement('canvas');
    row.appendChild(canvas);
    paintDish(canvas, id, 48, view.sprites);
  }
  for (const el of document.querySelectorAll('.ico[data-ico]')) {
    const canvas = document.createElement('canvas');
    el.appendChild(canvas);
    const which = el.dataset.ico;
    if (which === 'station') paintStation(canvas, 'oven', 34, view.sprites);
    else if (which === 'counter') paintDish(canvas, 'cupcake', 34, view.sprites);
    else {
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = 34 * dpr;
      canvas.height = 34 * dpr;
      canvas.style.width = '34px';
      canvas.style.height = '34px';
      ctx.scale(dpr, dpr);
      ctx.drawImage(view.sprites.heart, 0, 0, 34, 34);
    }
  }
}

function toTitle() {
  show('title');
  drawTitleArt();
  const stars = totalStars(save);
  const cleared = daysCleared(save);
  const next = Math.min(save.unlocked, DAY_COUNT);
  $('title-progress').textContent = cleared
    ? `★ ${stars} of ${DAY_COUNT * 3} · ${cleared} day${cleared === 1 ? '' : 's'} baked · ${save.coins.toLocaleString()} coins in the tin`
    : `${DAY_COUNT} days across ${CHAPTERS.length} chapters. Day one is just cocoa.`;
  $('btn-play').textContent = cleared ? `Day ${next} · ${getSpec(next).name}` : 'Open the bakery';
  renderOrders($('title-orders'));
}

function renderOrders(holder) {
  const board = refreshDaily(save, today, highestChapter(save));
  const done = board.orders.filter((o) => o.done).length;
  const streak = save.streak | 0;
  holder.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'head';
  head.innerHTML = `<span>Today's orders ${done}/3</span><span>${
    streak > 0 && streakAlive(save, today) ? `🔥 ${streak} day streak` : 'Play the special to start a streak'
  }</span>`;
  holder.appendChild(head);
  for (const order of board.orders) {
    const row = document.createElement('div');
    row.className = `order${order.done ? ' done' : ''}`;
    row.innerHTML = `<span class="mark">${order.done ? '✓' : '○'}</span>`
      + `<span>${order.label}</span>`
      + `<span class="pay">${order.done ? 'paid' : `${Math.min(order.progress, order.need)}/${order.need} · ${order.reward}`}</span>`;
    holder.appendChild(row);
  }
  if (board.bonusClaimed) {
    const row = document.createElement('div');
    row.className = 'order done';
    row.innerHTML = '<span class="mark">★</span><span>All three done — bonus paid</span><span class="pay">+150</span>';
    holder.appendChild(row);
  }
}

// --------------------------------------------------------------- the day map

function toMap() {
  show('map');
  backTo = 'map';
  const holder = $('map-holder');
  holder.innerHTML = '';
  $('map-totals').textContent = `★ ${totalStars(save)} · ${save.coins.toLocaleString()} coins`;
  for (const chapter of CHAPTERS) {
    const { from, to } = chapterRange(chapter.id);
    const open = from <= save.unlocked;
    const section = document.createElement('section');
    section.className = 'chapter';
    const got = [];
    for (let id = from; id <= to; id++) got.push(save.stars[id] | 0);
    const head = document.createElement('div');
    head.className = 'chapter-head';
    head.innerHTML = `<h3>${chapter.id}. ${open ? chapter.name : '???'}</h3>`
      + `<small>${open ? chapter.adds : 'Keep baking to open this chapter'}</small>`
      + `<span class="count">★ ${got.reduce((a, b) => a + b, 0)}/${got.length * 3}</span>`;
    section.appendChild(head);
    if (open) {
      const blurb = document.createElement('p');
      blurb.className = 'chapter-blurb';
      blurb.textContent = chapter.blurb;
      section.appendChild(blurb);
    }
    const days = document.createElement('div');
    days.className = 'days';
    for (let id = from; id <= to; id++) {
      const stars = save.stars[id] | 0;
      const unlocked = id <= save.unlocked;
      const button = document.createElement('button');
      button.className = `day${stars ? ' done' : ''}${id === save.unlocked ? ' next' : ''}`;
      button.disabled = !unlocked;
      button.innerHTML = `<b>${id}</b><span>${unlocked ? getSpec(id).name : '<span class="lock">🔒</span>'}</span>`
        + `<span class="pips">${[0, 1, 2].map((k) => `<i class="${k < stars ? 'on' : ''}"></i>`).join('')}</span>`;
      if (unlocked) button.addEventListener('click', () => { sfx.click(); toBrief(id); });
      days.appendChild(button);
    }
    section.appendChild(days);
    holder.appendChild(section);
  }
  const focus = holder.querySelector('.day.next');
  if (focus) requestAnimationFrame(() => focus.scrollIntoView({ block: 'center' }));
}

// ------------------------------------------------------------ kitchen shop

function toShop() {
  show('shop');
  const holder = $('shop-holder');
  holder.innerHTML = '';
  $('shop-coins').textContent = `${save.coins.toLocaleString()} coins`;
  for (const branch of BRANCHES) {
    const section = document.createElement('section');
    section.className = 'branch';
    const head = document.createElement('div');
    head.className = 'branch-head';
    const art = document.createElement('canvas');
    if (branch.icon === 'chair') {
      paintCustomer(art, 'bear', 40, view.sprites);
    } else if (branch.icon === 'counter') {
      paintDish(art, 'cake', 40, view.sprites);
    } else {
      paintStation(art, branch.icon, 40, view.sprites);
    }
    head.appendChild(art);
    const title = document.createElement('div');
    title.innerHTML = `<h3>${branch.name}</h3><small>${branch.blurb}</small>`;
    head.appendChild(title);
    section.appendChild(head);
    const list = document.createElement('div');
    list.className = 'ups';
    for (const up of upgradesIn(branch.id)) {
      const owned = owns(save, up.id);
      const open = owned || isAvailable(up.id, save.owned);
      const card = document.createElement('div');
      card.className = `up${owned ? ' owned' : ''}${open ? '' : ' locked'}`;
      card.innerHTML = `<b>${up.name}</b><p>${up.desc}</p><p class="tag">${up.shop}</p>`;
      const buy = document.createElement('div');
      buy.className = 'buy';
      if (owned) {
        buy.innerHTML = '<span class="tag">✓ in the shop</span>';
      } else if (!open) {
        buy.innerHTML = `<span class="price">needs ${getUpgrade(up.requires).name}</span>`;
      } else {
        const price = document.createElement('span');
        price.className = 'price';
        price.innerHTML = `<span class="coin-dot"></span>${up.cost.toLocaleString()}`;
        const button = document.createElement('button');
        button.className = 'btn small primary';
        button.textContent = 'Buy';
        button.disabled = save.coins < up.cost;
        button.addEventListener('click', () => {
          const res = buyUpgrade(save, up.id);
          if (!res.ok) return;
          persist();
          sfx.coin();
          log.event('upgrade.buy', { upgrade: up.id, cost: up.cost, coins: save.coins });
          toShop();
          $('shop-note').textContent = `${up.name}: ${up.shop}`;
        });
        buy.append(price, button);
      }
      card.appendChild(buy);
      list.appendChild(card);
    }
    section.appendChild(list);
    holder.appendChild(section);
  }
  const ownedCount = save.owned.length;
  $('shop-note').textContent = ownedCount
    ? `${ownedCount} of ${UPGRADES.length} fitted. Everything you buy shows up in the shop.`
    : 'Earn coins baking, then spend them here. Everything shows up in the shop.';
}

// ------------------------------------------------------------- recipe book

function toBook() {
  show('book');
  const holder = $('book-holder');
  holder.innerHTML = '';
  $('book-count').textContent = `${save.book.length}/${BOOK_ORDER.length} recipes`;
  const grid = document.createElement('div');
  grid.className = 'book-grid';
  for (const id of BOOK_ORDER) {
    const known = save.book.includes(id);
    const recipe = RECIPES[id];
    const card = document.createElement('div');
    card.className = `recipe${known ? '' : ' unknown'}`;
    const art = document.createElement('canvas');
    if (known) paintDish(art, id, 64, view.sprites);
    else paintSilhouette(art, id, 64, view.sprites);
    card.appendChild(art);
    const name = document.createElement('b');
    name.textContent = known ? recipe.name : '? ? ?';
    card.appendChild(name);
    const steps = document.createElement('div');
    steps.className = 'steps';
    steps.textContent = known ? recipe.steps.map((s) => STATIONS[s].short).join(' → ') : 'not baked yet';
    card.appendChild(steps);
    const blurb = document.createElement('p');
    blurb.textContent = known ? recipe.blurb : 'Serve one to write it down.';
    card.appendChild(blurb);
    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = known ? `${recipe.value} coins` : '';
    card.appendChild(value);
    grid.appendChild(card);
  }
  holder.appendChild(grid);

  const folkHead = document.createElement('h3');
  folkHead.className = 'section';
  folkHead.textContent = `Regulars and neighbours — ${save.met.length}/${Object.keys(CUSTOMERS).length} met`;
  holder.appendChild(folkHead);
  const folk = document.createElement('div');
  folk.className = 'folk';
  for (const [id, kind] of Object.entries(CUSTOMERS)) {
    const met = save.met.includes(id);
    const who = document.createElement('div');
    who.className = `who${met ? '' : ' unknown'}`;
    const art = document.createElement('canvas');
    paintCustomer(art, id, 54, view.sprites);
    who.appendChild(art);
    const name = document.createElement('b');
    name.textContent = met ? kind.name : '???';
    who.appendChild(name);
    const note = document.createElement('small');
    note.textContent = met ? (kind.note || 'A friendly face.') : 'Not in yet';
    who.appendChild(note);
    folk.appendChild(who);
  }
  holder.appendChild(folk);

  if (save.specials.length) {
    const head = document.createElement('h3');
    head.className = 'section';
    head.textContent = `Specials tasted — ${save.specials.length}`;
    holder.appendChild(head);
    const list = document.createElement('div');
    list.className = 'lines';
    for (const name of [...save.specials].reverse().slice(0, 12)) {
      const row = document.createElement('div');
      row.innerHTML = `<span>${name}</span><b>★</b>`;
      list.appendChild(row);
    }
    holder.appendChild(list);
  }
}

// ------------------------------------------------------------- the briefing

let pendingSpecial = false;

function toBrief(id, { special = false } = {}) {
  pendingSpecial = special;
  dayId = special ? dayId : Math.max(1, Math.min(DAY_COUNT, id));
  const preview = special
    ? buildSpecialDay(today, { chapter: highestChapter(save) })
    : buildDay(dayId, { assist: assistFor(save, dayId) });
  if (special) view.sprites.bakeDish('special');
  show('brief');
  $('brief-chapter').textContent = special
    ? "Today's special"
    : `Chapter ${chapterOf(dayId).id} · ${chapterOf(dayId).name}`;
  $('brief-name').textContent = special ? preview.name : `Day ${dayId} · ${preview.name}`;
  const tip = $('brief-tip');
  const note = preview.assist ? `${preview.tip ? `${preview.tip} ` : ''}Flour is lending a hand today: more time, and everybody waits longer.` : preview.tip;
  tip.textContent = note || chapterOf(preview.chapter).blurb;
  const menu = $('brief-menu');
  menu.innerHTML = '';
  for (const id2 of preview.pool) {
    const item = document.createElement('div');
    item.className = 'item';
    const art = document.createElement('canvas');
    paintDish(art, id2, 44, view.sprites);
    const label = document.createElement('small');
    label.textContent = RECIPES[id2].name;
    item.append(art, label);
    menu.appendChild(item);
  }
  const best = special ? 0 : save.best[dayId] | 0;
  $('brief-goals').innerHTML = [
    ['Customers', `${preview.customers.length}`],
    ['On the clock', `${preview.seconds}s`],
    ['★ for', `${preview.stars[0]} · ${preview.stars[1]} · ${preview.stars[2]} coins`],
    best ? ['Your best', `${best.toLocaleString()} coins`] : null,
  ].filter(Boolean).map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  $('btn-brief-go').textContent = special ? 'Bake the special' : 'Open up!';
}

// ------------------------------------------------------------------ the day

function startDay({ special = false } = {}) {
  sfx.unlock();
  sfx.startMusic();
  plan = special
    ? buildSpecialDay(today, { chapter: highestChapter(save) })
    : buildDay(dayId, { assist: assistFor(save, dayId) });
  if (special) view.sprites.bakeDish('special');
  const eff = effects(save.owned);
  shift = new Shift(plan, { effects: eff, seed: (Date.now() % 100000) + 1 });
  view.setShift(shift, { decor: eff.decor });
  shownCoins = 0;
  lastHudCoins = -1;
  warnedClosing = false;
  aiBudget = 1;
  show('play');
  layout();
  queueMicrotask(() => monitor.mark(performance.now(), 'day'));
  $('hud-name').textContent = special ? plan.name : `Day ${plan.id} · ${plan.name}`;
  $('hud-chapter').textContent = special ? "Today's special" : chapterOf(plan.id).name;
  updateHud(true);
  toast(special ? `Today's special: ${plan.name}` : `Day ${plan.id} · ${plan.name}`, 2.2);
  if (plan.assist) showTip(`${plan.tip ? `${plan.tip} ` : ''}Flour is lending a hand today: more time, and everybody waits longer.`, 8);
  else if (plan.tip) showTip(plan.tip, 7);
  log.event('level.start', {
    day: special ? 0 : plan.id, chapter: plan.chapter, kind: plan.kind,
    assist: !!plan.assist, customers: plan.customers.length, upgrades: save.owned.length,
    autopilot,
  });
}

function updateHud(force = false) {
  if (!shift) return;
  const target = shift.coins;
  shownCoins += (target - shownCoins) * (force ? 1 : 0.2);
  if (Math.abs(target - shownCoins) < 1) shownCoins = target;
  const coins = Math.round(shownCoins);
  if (coins !== lastHudCoins) {
    lastHudCoins = coins;
    $('hud-coins').textContent = coins.toLocaleString();
    const stars = starsFor(plan, shift.coins);
    const pips = $('hud-stars').children;
    for (let k = 0; k < 3; k++) pips[k].classList.toggle('on', k < stars);
  }
  const jar = $('hud-combo');
  jar.classList.toggle('on', shift.combo > 1);
  if (shift.combo > 1) jar.firstChild.textContent = `×${shift.combo} tips`;
  const left = shift.left;
  $('hud-clock-fill').style.width = `${(left / plan.seconds) * 100}%`;
  $('hud-clock').classList.toggle('low', left <= 15);
  if (left <= 10 && !warnedClosing) {
    warnedClosing = true;
    toast('Ten seconds — finish what you can!', 2);
  }
}

let toastTimer = 0;
function toast(text, seconds = 1.6) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  toastTimer = seconds;
}

let tipTimer = 0;
function showTip(text, seconds = 6) {
  const el = $('tip');
  el.textContent = text;
  el.classList.remove('hidden');
  tipTimer = seconds;
}

// --------------------------------------------------------------- the result

function endDay() {
  const result = shift.result();
  const special = plan.kind === 'special';
  const out = recordDay(save, plan, result);
  const orders = applyOrders(save, result, out.stars, today);
  let streak = null;
  if (special) {
    tasteSpecial(save, plan.name);
    if (out.stars >= 1) streak = bankSpecial(save, today);
  }
  persist();
  const lines = [];
  const buttons = [];
  $('res-title').textContent = out.stars >= 2 ? 'Lovely day!' : out.stars === 1 ? 'Day done!' : 'Shop closed';
  $('res-coins').textContent = `${result.coins.toLocaleString()} coins`;
  $('res-sub').textContent = special
    ? `${plan.name} · ${result.served} served`
    : `Day ${plan.id} · ${plan.name}`;
  const pips = $('res-stars').children;
  for (let k = 0; k < 3; k++) pips[k].classList.toggle('on', k < out.stars);
  lines.push(['Dishes served', `${result.served}`]);
  lines.push(['Happy customers', `${result.happy}`]);
  if (result.bestCombo > 1) lines.push(['Best tip combo', `×${result.bestCombo}`]);
  if (result.crispy) lines.push(['A bit crispy', `${result.crispy}`]);
  if (result.missed) lines.push(['Had to go', `${result.missed}`]);
  if (!special) {
    lines.push(['Your best here', `${(save.best[plan.id] | 0).toLocaleString()} coins`]);
    if (out.newBest && save.shifts > 1) lines.push(['New best!']);
    if (out.stars < 3) lines.push([`${plan.stars[out.stars]} coins for ${out.stars + 1} star${out.stars ? 's' : ''}`]);
  }
  for (const order of orders.finished) lines.push([`Order done: ${order.label}`, `+${order.reward}`]);
  if (orders.bonus) lines.push(['All three orders done!', `+${orders.bonus}`]);
  if (streak && streak.first) lines.push([`Streak: ${streak.streak} day${streak.streak === 1 ? '' : 's'} in a row`]);
  if (out.stars === 0) {
    lines.push(['Every coin is in the tin. Buy something for the kitchen and try again.']);
    if (out.assistNext) lines.push(['Flour will lend a hand next time: more time, and everybody waits longer.']);
  }
  if (special) {
    buttons.push(['Bake it again', true, () => startDay({ special: true })]);
  } else if (out.cleared && plan.id < DAY_COUNT) {
    buttons.push([`Day ${out.nextDay} →`, true, () => { dayId = out.nextDay; toBrief(dayId); }]);
    buttons.push(['Replay', false, () => startDay()]);
  } else if (out.cleared) {
    lines.push(['You baked every day in town. Flour is very proud.']);
    buttons.push(['Replay', true, () => startDay()]);
  } else {
    buttons.push(['Try again', true, () => startDay()]);
  }
  buttons.push(['Kitchen shop', false, () => { backTo = 'results'; toShop(); }]);
  buttons.push(['Day map', false, () => toMap()]);
  $('res-lines').innerHTML = lines
    .map(([a, b]) => (b === undefined ? `<div class="highlight">${a}</div>` : `<div><span>${a}</span><b>${b}</b></div>`))
    .join('');
  const row = $('res-buttons');
  row.innerHTML = '';
  for (const [label, primary, action] of buttons) {
    const button = document.createElement('button');
    button.className = `btn${primary ? ' primary' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => { sfx.click(); action(); });
    row.appendChild(button);
  }
  show('results');
  sfx.fanfare(out.stars);
  for (let k = 0; k < out.stars; k++) setTimeout(() => sfx.star(k), 480 + k * 280);
  log.event(out.stars > 0 ? 'level.complete' : 'level.fail', {
    day: special ? 0 : plan.id, kind: plan.kind, stars: out.stars, coins: result.coins,
    served: result.served, happy: result.happy, missed: result.missed,
    crispy: result.crispy, 'combo.best': result.bestCombo, 'best.new': out.newBest,
    seconds: result.seconds, autopilot,
  });
}

// ------------------------------------------------------------------- states

function pause() {
  if (mode !== 'play') return;
  show('pause');
  $('pause-note').textContent = plan
    ? `${plan.kind === 'special' ? plan.name : `Day ${plan.id} · ${plan.name}`} · ${shift.coins.toLocaleString()} coins so far`
    : '';
  $('btn-pause-mute').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
}

function resume() {
  if (mode !== 'pause') return;
  show('play');
  layout();
}

function showMute() {
  $('btn-mute').textContent = save.muted ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', save.muted ? 'Sound off' : 'Sound on');
  $('btn-pause-mute').textContent = `Sound: ${save.muted ? 'off' : 'on'}`;
}

function toggleMute() {
  save.muted = !save.muted;
  sfx.setMuted(save.muted);
  persist();
  showMute();
}

// -------------------------------------------------------------------- input

const canvas = $('shop');

function act(zone) {
  if (!shift || mode !== 'play' || shift.done || !zone) return;
  if (zone.kind === 'station') shift.tapStation(zone.index);
  else if (zone.kind === 'counter') shift.serve();
  else if (zone.kind === 'seat') shift.serveSeat(zone.index);
  else if (zone.kind === 'ticket') {
    if (zone.state === 'waiting') {
      shift.select(zone.id);
      sfx.click();
    } else {
      sfx.bonk();
    }
  }
}

function pointerPos(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

canvas.addEventListener('pointerdown', (event) => {
  if (mode !== 'play' || !shift) return;
  event.preventDefault();
  const { x, y } = pointerPos(event);
  act(view.hit(x, y));
});

canvas.addEventListener('pointermove', (event) => {
  if (mode !== 'play' || !shift) return;
  const { x, y } = pointerPos(event);
  view.hover = view.hit(x, y);
});

canvas.addEventListener('pointerleave', () => { view.hover = null; });

function cycleTicket(dir) {
  if (!shift) return;
  const waiting = shift.tickets().filter((t) => t.state === 'waiting');
  if (!waiting.length) {
    shift.selected = null;
    return;
  }
  const at = waiting.findIndex((t) => t.id === shift.selected);
  const next = at < 0 ? (dir > 0 ? 0 : waiting.length - 1) : (at + dir + waiting.length) % waiting.length;
  shift.selected = waiting[next].id;
  sfx.click();
}

function moveCursor(dir) {
  if (!shift) return;
  const n = shift.stations.length;
  view.cursor = view.cursor < 0 ? (dir > 0 ? 0 : n - 1) : (view.cursor + dir + n) % n;
}

addEventListener('keydown', (event) => {
  if (PAUSE_KEYS.includes(event.code)) {
    event.preventDefault();
    if (mode === 'play') pause();
    else if (mode === 'pause') resume();
    else if (mode === 'brief') toMap();
    else if (mode === 'results') toMap();
    else if (mode !== 'title') toTitle();
    return;
  }
  if (MUTE_KEYS.includes(event.code)) {
    toggleMute();
    return;
  }
  if (mode !== 'play' || !shift) return;
  const station = stationFromKey(event.code);
  if (station >= 0) {
    event.preventDefault();
    if (station < shift.stations.length) {
      view.cursor = station;
      shift.tapStation(station);
    }
    return;
  }
  if (SERVE_KEYS.includes(event.code)) {
    event.preventDefault();
    if (view.cursor >= 0 && event.shiftKey) shift.tapStation(view.cursor);
    else shift.serve();
    return;
  }
  if (LEFT_KEYS.includes(event.code)) {
    event.preventDefault();
    cycleTicket(-1);
    return;
  }
  if (RIGHT_KEYS.includes(event.code)) {
    event.preventDefault();
    cycleTicket(1);
  }
});

function pollPad() {
  if (!pad.poll()) return;
  if (pad.hit('start')) {
    if (mode === 'play') pause();
    else if (mode === 'pause') resume();
    return;
  }
  if (mode !== 'play' || !shift) return;
  if (pad.hit('left')) moveCursor(-1);
  if (pad.hit('right')) moveCursor(1);
  if (pad.hit('act')) {
    if (view.cursor < 0) view.cursor = 0;
    else shift.tapStation(view.cursor);
  }
  if (pad.hit('serve')) shift.serve();
  if (pad.hit('next')) cycleTicket(1);
  if (pad.hit('back')) cycleTicket(-1);
}

// --------------------------------------------------------------- the loop

let pointerIdle = 0;
let pointerHidden = false;
addEventListener('mousemove', () => { pointerIdle = 0; });

function updatePointer(dt) {
  pointerIdle += dt;
  const hide = mode === 'play' && pointerIdle > 2;
  if (hide !== pointerHidden) {
    pointerHidden = hide;
    document.body.classList.toggle('no-cursor', hide);
  }
}

const monitor = frameMonitor({
  log,
  snapshot: () => ({
    mode,
    day: plan ? plan.id : 0,
    customers: shift ? shift.active.length : 0,
    particles: view.particles.length,
  }),
  visible: () => document.visibilityState === 'visible',
  crashed: () => !!telemetry?.crashed,
});
setInterval(() => monitor.check(performance.now()), 1000);
document.addEventListener('visibilitychange', () => monitor.reset(performance.now()));

function runAi(dt) {
  aiBudget = Math.min(aiBudget + dt * PACE.steady, 1);
  if (aiBudget < 1) return;
  const action = chooseAction(shift);
  if (!action) return;
  doAction(shift, action);
  aiBudget -= 1;
}

let last = performance.now();
function frame(now) {
  monitor.frame(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updatePointer(dt);
  pollPad();
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) $('toast').classList.add('hidden');
  }
  if (tipTimer > 0) {
    tipTimer -= dt;
    if (tipTimer <= 0) $('tip').classList.add('hidden');
  }
  if (mode === 'play' && shift && !shift.done) {
    if (autopilot) runAi(dt);
    shift.tick(dt);
    const events = shift.drain();
    if (events.length) {
      sfx.handleEvents(events);
      view.handleEvents(events);
      for (const event of events) {
        if (event.type === 'arrive' && meetCustomer(save, event.kind)) persist();
        if (event.type === 'serve') {
          const recipe = event.recipe;
          if (!save.book.includes(recipe)) {
            save.book.push(recipe);
            persist();
            toast(`${RECIPES[recipe].name} written in the recipe book!`, 2);
          }
        }
      }
    }
    updateHud();
    if (shift.done) endDay();
  }
  if (shift) {
    if (mode !== 'pause') view.update(dt, now);
    view.draw();
  }
  requestAnimationFrame(loop);
}

// A crash inside a frame shows the crash screen instead of a frozen picture.
const loop = telemetry ? telemetry.guard(frame, 'bakery-blitz.frame') : frame;

// ------------------------------------------------------------------ wiring

$('btn-play').addEventListener('click', () => { sfx.click(); toBrief(Math.min(save.unlocked, DAY_COUNT)); });
$('btn-map').addEventListener('click', () => { sfx.click(); toMap(); });
$('btn-shop').addEventListener('click', () => { sfx.click(); backTo = 'title'; toShop(); });
$('btn-book').addEventListener('click', () => { sfx.click(); backTo = 'title'; toBook(); });
$('btn-special').addEventListener('click', () => { sfx.click(); toBrief(dayId, { special: true }); });
$('btn-map-shop').addEventListener('click', () => { sfx.click(); backTo = 'map'; toShop(); });
$('btn-map-book').addEventListener('click', () => { sfx.click(); backTo = 'map'; toBook(); });
for (const el of document.querySelectorAll('[data-to-title]')) {
  el.addEventListener('click', () => { sfx.click(); toTitle(); });
}
for (const el of document.querySelectorAll('[data-back]')) {
  el.addEventListener('click', () => {
    sfx.click();
    if (backTo === 'map') toMap();
    else if (backTo === 'results' && plan) show('results');
    else toTitle();
  });
}
$('btn-brief-go').addEventListener('click', () => { sfx.click(); startDay({ special: pendingSpecial }); });
$('btn-brief-back').addEventListener('click', () => { sfx.click(); toMap(); });
$('btn-menu').addEventListener('click', pause);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => startDay({ special: plan && plan.kind === 'special' }));
$('btn-pause-mute').addEventListener('click', toggleMute);
$('btn-pause-map').addEventListener('click', () => toMap());
addEventListener('resize', layout);
addEventListener('orientationchange', () => setTimeout(layout, 120));
new ResizeObserver(layout).observe($('stage'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play') pause();
});
for (const el of document.querySelectorAll('button, .btn')) {
  el.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
}

showMute();

log.event('game.ready', {
  unlocked: save.unlocked, stars: totalStars(save), coins: save.coins,
  upgrades: save.owned.length, recipes: save.book.length, streak: save.streak,
});

if (params.has('day')) {
  dayId = Math.max(1, Math.min(DAY_COUNT, Number(params.get('day')) || 1));
  startDay();
} else if (params.has('special')) {
  startDay({ special: true });
} else if (params.has('map')) {
  toMap();
} else {
  toTitle();
}

requestAnimationFrame(loop);

// Handy for poking at the bakery from the console.
window.BB = {
  get shift() { return shift; },
  get plan() { return plan; },
  view, save, sfx, startDay, toBrief, toMap, toShop, toBook,
  setAutopilot(on) { autopilot = !!on; },
};
