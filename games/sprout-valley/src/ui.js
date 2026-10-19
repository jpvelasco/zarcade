// DOM menus and HUD: shop, shipping bin, market, kitchen, board, fair,
// bag, journal, dialogue and the bedtime card. Reads the world and calls its
// menu methods; never touches simulation state directly.
import {
  ITEMS, CROPS, FISH, CRITTERS, GOODS, RECIPES, VILLAGERS, VILLAGER_IDS, FESTIVALS, FESTIVAL_IDS, GOALS, TOOL_NAMES, TOOLS,
  SEASON_NAMES, sellable, giftable, MAX_HEARTS, CROP_IDS, FISH_IDS, CRITTER_IDS, HEART_POINTS,
} from './data.js';
import { shopStock, sellPrice, marketPrice, canCraft } from './economy.js';
import { formatTime, dateOf, DAYS_PER_SEASON, MARKET_DAY } from './time.js';
import { heartsOf } from './villagers.js';
import { BELT_SIZE } from './world.js';

const $ = (id) => document.getElementById(id);
const WEATHER_ICON = { sunny: '☀️', cloudy: '⛅', rain: '🌧️', snow: '❄️' };
const WEATHER_NAME = { sunny: 'Sunny', cloudy: 'Cloudy', rain: 'Rain', snow: 'Snow' };
const SEASON_ICON = { spring: '🌸', summer: '🌻', autumn: '🍂', winter: '⛄' };
const REACTION_ICON = { love: '💖', like: '🙂', neutral: '😐', dislike: '😕' };

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

const gold = (n) => `${Math.round(n).toLocaleString('en-US')}g`;
const heartsHtml = (n) => h('span', { class: 'hearts', 'aria-label': `${n} of ${MAX_HEARTS} hearts` }, ...Array.from({ length: MAX_HEARTS }, (_, i) => h('i', { class: i < n ? 'on' : '' }, '♥')));

export class UI {
  constructor({ sound, onClose, onSleep, icons, portraits }) {
    this.sound = sound;
    this.onClose = onClose;
    this.onSleep = onSleep;
    this.icons = icons;
    this.portraits = portraits;
    this.panel = $('panel');
    this.open = null; // name of the open panel
    this.world = null;
    this.toastTimer = 0;
    this.beltBuilt = false;
    $('panel-close').addEventListener('click', () => this.close());
    $('dialogue-bye').addEventListener('click', () => this.close());
  }

  icon(id, cls = 'ico') {
    return h('img', { class: cls, src: this.icons[id] || this.icons.hay, alt: '', draggable: 'false' });
  }

  get isOpen() { return !!this.open; }

  // ------------------------------------------------------------ HUD

  buildBelt(world, onPick) {
    const belt = $('belt');
    belt.innerHTML = '';
    this.slots = [];
    for (let i = 0; i < BELT_SIZE; i++) {
      const b = h('button', { class: 'slot', 'aria-label': `Belt slot ${i + 1}`, onclick: () => onPick(i) },
        h('span', { class: 'key' }, String(i + 1)), h('img', { class: 'ico', alt: '', draggable: 'false' }), h('span', { class: 'count' }));
      belt.append(b);
      this.slots.push(b);
    }
    this.beltBuilt = true;
    this.beltKey = '';
    this.updateBelt(world);
  }

  updateBelt(world) {
    const key = `${world.sel}|${world.belt.join(',')}|${world.belt.map((id) => (id && !TOOLS.includes(id) ? world.inv[id] || 0 : '')).join(',')}|${world.water}|${world.canLevel}`;
    if (key === this.beltKey) return;
    this.beltKey = key;
    world.belt.forEach((id, i) => {
      const b = this.slots[i];
      const img = b.querySelector('img'), count = b.querySelector('.count');
      b.classList.toggle('sel', i === world.sel);
      b.classList.toggle('empty', !id);
      if (!id) { img.removeAttribute('src'); img.style.visibility = 'hidden'; count.textContent = ''; b.title = 'Empty slot (open your bag to fill it)'; return; }
      img.style.visibility = '';
      const src = this.icons[id];
      if (img.getAttribute('src') !== src) img.src = src;
      if (id === 'can') { count.textContent = `${world.water}`; b.title = `${world.canInfo.name}: ${world.water}/${world.canInfo.capacity}`; }
      else if (TOOLS.includes(id)) { count.textContent = ''; b.title = TOOL_NAMES[id]; }
      else { count.textContent = world.inv[id] || 0; b.title = ITEMS[id].name; }
    });
    const sel = world.selected;
    $('belt-label').textContent = !sel ? 'Empty hands' : TOOLS.includes(sel) ? (sel === 'can' ? world.canInfo.name : TOOL_NAMES[sel]) : ITEMS[sel].name;
  }

  updateHud(world) {
    const d = world.date;
    const night = world.minute >= 19 * 60 + 30;
    const dayKey = `${world.day}|${world.weather}|${night}`;
    if (dayKey !== this.dayKey) {
      this.dayKey = dayKey;
      $('hud-date').textContent = `${SEASON_ICON[d.season]} ${SEASON_NAMES[d.season]} ${d.day} · ${d.weekday.slice(0, 3)}`;
      $('hud-weather').textContent = night && world.weather === 'sunny' ? '🌙' : WEATHER_ICON[world.weather];
      $('hud-weather').title = `${WEATHER_NAME[world.weather]} · tomorrow: ${WEATHER_NAME[world.tomorrow]}`;
    }
    const t = formatTime(world.minute);
    if (t !== this.timeText) { this.timeText = t; $('hud-time').textContent = t; $('hud-clock').classList.toggle('late', world.minute >= 24 * 60); }
    if (world.money !== this.moneyShown) {
      this.moneyShown = world.money;
      $('hud-money').textContent = gold(world.money);
    }
    const goal = world.activeGoals(1)[0];
    const fest = world.festival && world.festivalRunning() && !world.fest?.done ? FESTIVALS[world.festival] : null;
    let text = '';
    if (fest) text = `🎉 ${fest.name}: ${festProgress(world)}`;
    else if (goal) text = `${goal.text}${goal.n > 1 ? ` (${Math.min(goal.have, goal.n).toLocaleString('en-US')}/${goal.n.toLocaleString('en-US')})` : ''}`;
    if (text !== this.goalText) { this.goalText = text; $('hud-goal').textContent = text; $('hud-goal').classList.toggle('hidden', !text); $('hud-goal').classList.toggle('fest', !!fest); }
    this.updateBelt(world);
  }

  toast(text, tone = 'info') {
    const box = $('toasts');
    const el = h('div', { class: `toast ${tone}` }, text);
    box.append(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  // ------------------------------------------------------------ panels

  show(name, title, { money = true, wide = false } = {}) {
    this.open = name;
    $('dialogue').classList.add('hidden');
    this.panel.classList.remove('hidden');
    this.panel.querySelector('.card').classList.toggle('wide', wide);
    $('panel-title').textContent = title;
    $('panel-money').textContent = money ? gold(this.world.money) : '';
    $('panel-tabs').innerHTML = '';
    $('panel-body').innerHTML = '';
    $('panel-foot').innerHTML = '';
    this.sound.play('open');
  }

  refreshMoney() { if (this.open) $('panel-money').textContent = gold(this.world.money); }

  focusFirst() {
    const root = this.open === 'dialogue' ? $('dialogue') : this.panel;
    const el = root.querySelector('.tab.on, button.primary:not([disabled]), button:not([disabled]):not(#panel-close)');
    el?.focus({ preventScroll: true });
  }

  close() {
    if (!this.open) return;
    this.open = null;
    this.panel.classList.add('hidden');
    $('dialogue').classList.add('hidden');
    this.sound.play('close');
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    this.onClose?.();
  }

  tabs(list, current, onPick) {
    const bar = $('panel-tabs');
    bar.innerHTML = '';
    for (const [id, label] of list) bar.append(h('button', { class: `tab${id === current ? ' on' : ''}`, onclick: () => { this.sound.play('select'); onPick(id); } }, label));
  }

  row({ icon, name, desc, right, cls = '' }) {
    return h('div', { class: `row ${cls}` }, icon ? this.icon(icon) : null, h('div', { class: 'grow' }, h('b', {}, name), desc ? h('small', {}, desc) : null), h('div', { class: 'acts' }, ...right));
  }

  // ---- shop
  openShop(world, tab = 'seeds') {
    this.world = world;
    if (this.open !== 'shop') this.show('shop', 'General Store', { wide: true });
    const mabelHere = world.vpos.mabel && !world.vpos.mabel.hidden && world.vpos.mabel.spot === 'shop';
    const stock = shopStock(world.stockState());
    const groups = { seeds: stock.filter((s) => s.kind === 'seed'), farm: stock.filter((s) => ['hay', 'sprinkler', 'animal'].includes(s.kind)), upgrades: stock.filter((s) => s.kind === 'upgrade'), decor: stock.filter((s) => s.kind === 'decor') };
    this.tabs([['seeds', '🌱 Seeds'], ['farm', '🐔 Farm'], ['upgrades', '🔨 Upgrades'], ['decor', '🪴 Decor']], tab, (t) => this.openShop(world, t));
    const body = $('panel-body');
    body.innerHTML = '';
    body.append(h('p', { class: 'say' }, mabelHere ? `Mabel: "${shopLine(world, tab)}"` : 'Mabel is out. Leave the coins in the jar, she says!'));
    const list = groups[tab];
    if (!list.length) body.append(h('p', { class: 'muted center' }, tab === 'upgrades' ? 'You own every upgrade. Wow!' : 'Nothing here right now.'));
    for (const s of list) {
      const iconId = s.kind === 'animal' ? (s.id === 'chicken' ? 'egg' : s.id === 'cow' ? 'milk' : 'goatmilk') : s.kind === 'upgrade' ? (s.id.startsWith('can') ? 'can' : s.id === 'field' ? 'hoe' : 'sprinkler') : s.id;
      const multi = s.kind === 'seed' || s.kind === 'hay' || (s.kind === 'decor' && s.id === 'path');
      const buy = (n) => () => {
        if (world.buy(s.id, n)) { this.sound.play('buy'); this.openShop(world, tab); this.refreshMoney(); }
        else { this.sound.play('warn'); this.toast(world.money < s.cost * n ? 'Not enough gold yet.' : 'You can\'t buy that right now.', 'warn'); }
      };
      const right = [h('span', { class: 'price' }, gold(s.cost)), h('button', { class: 'btn small', disabled: world.money < s.cost, onclick: buy(1) }, 'Buy')];
      if (multi) right.push(h('button', { class: 'btn small', disabled: world.money < s.cost * 5, onclick: buy(5) }, '×5'));
      const owned = s.kind !== 'upgrade' && s.kind !== 'animal' && world.inv[s.id] ? ` · you have ${world.inv[s.id]}` : '';
      body.append(this.row({ icon: iconId, name: s.name + (s.offSeason ? ' (greenhouse)' : ''), desc: (s.desc || '') + owned, right }));
    }
    if (mabelHere) $('panel-foot').append(h('button', { class: 'btn', onclick: () => this.openDialogue(world.talkTo('mabel')) }, '💬 Chat with Mabel'));
    this.focusFirst();
  }

  // ---- shipping bin / market
  openSell(world, market = false) {
    this.world = world;
    const name = market ? 'market' : 'bin';
    if (this.open !== name) this.show(name, market ? 'Saturday Market' : 'Shipping Bin', { wide: true });
    const body = $('panel-body');
    body.innerHTML = '';
    body.append(h('p', { class: 'say' }, market
      ? 'Market prices are 25% better than the bin, and you get paid right away!'
      : 'Put things in the bin and they are sold overnight. You get the coins in the morning.'));
    const items = Object.keys(world.inv).filter(sellable).sort((a, b) => sellPrice(b) - sellPrice(a));
    if (!items.length) body.append(h('p', { class: 'muted center' }, 'Nothing to sell yet. Harvest crops, collect eggs or catch fish!'));
    for (const id of items) {
      const price = market ? marketPrice(id) : sellPrice(id);
      const n = world.inv[id];
      const act = (k) => () => {
        const ok = market ? world.sellAtMarket(id, k) : world.ship(id, k);
        if (ok) this.sound.play(market ? 'coin' : 'ship');
        this.openSell(world, market);
        this.refreshMoney();
      };
      body.append(this.row({ icon: id, name: `${ITEMS[id].name} ×${n}`, desc: `${gold(price)} each`, right: [h('button', { class: 'btn small', onclick: act(1) }, market ? 'Sell 1' : 'Ship 1'), h('button', { class: 'btn small primary', onclick: act(n) }, `All ${gold(price * n)}`)] }));
    }
    const foot = $('panel-foot');
    foot.innerHTML = '';
    if (!market) {
      const binItems = Object.entries(world.bin);
      if (binItems.length) {
        const chips = binItems.map(([id, n]) => h('button', { class: 'chip', title: 'Take one back', onclick: () => { world.unship(id, 1); this.openSell(world, false); } }, this.icon(id), `×${n}`));
        foot.append(h('div', { class: 'binline' }, h('span', {}, `In the bin: ${gold(world.binValue())}`), ...chips));
      }
    }
    this.focusFirst();
  }

  // ---- home: sleep and kitchen
  openHome(world) {
    this.world = world;
    this.show('home', 'Your Farmhouse', { money: true });
    const body = $('panel-body');
    const late = world.minute >= 18 * 60;
    body.append(h('p', { class: 'say' }, late ? 'The bed looks so cozy. Ready to call it a day?' : `It's only ${formatTime(world.minute)}. You can sleep early, or cook something!`));
    const binV = world.binValue();
    if (binV) body.append(h('p', { class: 'muted' }, `The shipping bin will pay ${gold(binV)} overnight.`));
    body.append(h('div', { class: 'col' },
      h('button', { class: 'btn primary big', onclick: () => { this.close(); this.onSleep(); } }, '🛏️ Sleep until morning'),
      h('button', { class: 'btn', onclick: () => this.openKitchen(world) }, '🍳 Kitchen'),
      h('button', { class: 'btn', onclick: () => this.close() }, 'Not yet')));
    this.focusFirst();
  }

  openKitchen(world) {
    this.world = world;
    if (this.open !== 'kitchen') this.show('kitchen', 'Kitchen', { wide: true });
    const body = $('panel-body');
    body.innerHTML = '';
    body.append(h('p', { class: 'say' }, 'Cooked and preserved goods sell for much more than raw ingredients.'));
    for (const [id, r] of Object.entries(RECIPES)) {
      const needs = Object.entries(r.needs).map(([i, n]) => h('span', { class: `need${(world.inv[i] || 0) >= n ? ' ok' : ''}` }, this.icon(i), `${world.inv[i] || 0}/${n} ${ITEMS[i].name}`));
      const ok = canCraft(world.inv, id);
      body.append(this.row({ icon: id, name: r.name, desc: h('span', { class: 'needs' }, ...needs), right: [h('span', { class: 'price' }, gold(GOODS[id].sell)), h('button', { class: 'btn small primary', disabled: !ok, onclick: () => { if (world.craft(id)) { this.sound.play('harvest'); this.toast(`You made ${r.name}!`, 'good'); } this.openKitchen(world); } }, 'Cook')] }));
    }
    $('panel-foot').append(h('button', { class: 'btn', onclick: () => this.openHome(world) }, '← Back'));
    this.focusFirst();
  }

  // ---- community board
  openBoard(world) {
    this.world = world;
    if (this.open !== 'board') this.show('board', 'Community Board');
    const body = $('panel-body');
    body.innerHTML = '';
    const d = world.date;
    body.append(h('p', { class: 'say' }, `Requests for ${SEASON_NAMES[d.season]}. New notes go up every Monday.`));
    world.requests.forEach((r, i) => {
      const have = world.inv[r.item] || 0;
      body.append(h('div', { class: `note${r.done ? ' done' : ''}` },
        h('img', { class: 'face', src: this.portraits[r.villager], alt: '' }),
        h('div', { class: 'grow' },
          h('b', {}, `${VILLAGERS[r.villager].name} would love ${r.n} ${ITEMS[r.item].name}${r.n > 1 && !ITEMS[r.item].name.endsWith('s') ? 's' : ''}`),
          h('small', {}, r.done ? 'Done! Thank you!' : `Reward: ${gold(r.reward)} and friendship · you have ${have}`)),
        this.icon(r.item),
        r.done ? h('span', { class: 'stamp' }, '✓') : h('button', { class: 'btn small primary', disabled: have < r.n, onclick: () => { if (world.deliver(i)) { this.sound.play('goal'); this.toast(`${VILLAGERS[r.villager].name} is thrilled! +${gold(r.reward)}`, 'good'); } this.openBoard(world); this.refreshMoney(); } }, 'Deliver')));
    });
    const next = FESTIVAL_IDS.map((id) => ({ id, ...FESTIVALS[id] })).find((f) => f.season === d.season && f.day >= d.day);
    if (next) body.append(h('p', { class: 'poster' }, `🎉 ${next.name}: ${SEASON_NAMES[next.season]} ${next.day} (${dateOf(next.day - 1).weekday}), ${formatTime(next.start)} to ${formatTime(next.end)}. ${next.desc}`));
    body.append(h('p', { class: 'poster' }, '🧺 Saturday Market at the stall in the plaza, 8 am to 5 pm. Better prices!'));
    this.focusFirst();
  }

  // ---- harvest fair
  openFair(world) {
    this.world = world;
    this.show('fair', 'Harvest Fair Booth', { wide: true });
    this.fairPick = [];
    this.renderFair(world);
  }

  renderFair(world) {
    const body = $('panel-body');
    body.innerHTML = '';
    if (world.fest?.result) {
      const r = world.fest.result;
      body.append(h('div', { class: 'center big-result' }, h('div', { class: `ribbon ${r.ribbon}` }, '🎀'), h('h3', {}, `${r.ribbon[0].toUpperCase() + r.ribbon.slice(1)} ribbon!`), h('p', {}, `The judges scored your display ${r.score} points. Prize: ${gold(r.gold)}.`)));
      return this.focusFirst();
    }
    body.append(h('p', { class: 'say' }, 'Pick up to three things for your display. Valuable and varied wins!'));
    const picked = h('div', { class: 'picked' }, ...[0, 1, 2].map((i) => this.fairPick[i] ? h('button', { class: 'chip', onclick: () => { this.fairPick.splice(i, 1); this.renderFair(world); } }, this.icon(this.fairPick[i]), ITEMS[this.fairPick[i]].name) : h('span', { class: 'chip empty' }, '+')));
    body.append(picked);
    const grid = h('div', { class: 'grid' });
    for (const id of Object.keys(world.inv).filter(sellable)) {
      const used = this.fairPick.filter((x) => x === id).length;
      grid.append(h('button', { class: 'cell', disabled: used >= world.inv[id] || this.fairPick.length >= 3, title: ITEMS[id].name, onclick: () => { this.fairPick.push(id); this.renderFair(world); } }, this.icon(id), h('span', { class: 'count' }, world.inv[id] - used)));
    }
    body.append(grid);
    $('panel-foot').innerHTML = '';
    $('panel-foot').append(h('button', { class: 'btn primary', disabled: !this.fairPick.length, onclick: () => { const r = world.submitFair(this.fairPick); if (r) this.renderFair(world); this.refreshMoney(); } }, 'Show the judges!'));
    this.focusFirst();
  }

  // ---- bag
  openBag(world, onBelt) {
    this.world = world;
    if (this.open !== 'bag') this.show('bag', 'Your Bag', { wide: true });
    const body = $('panel-body');
    body.innerHTML = '';
    const ids = Object.keys(world.inv).sort((a, b) => kindOrder(a) - kindOrder(b) || ITEMS[a].name.localeCompare(ITEMS[b].name));
    if (!ids.length) body.append(h('p', { class: 'muted center' }, 'Your bag is empty.'));
    const grid = h('div', { class: 'grid' });
    const info = h('div', { class: 'info' }, h('p', { class: 'muted' }, 'Pick an item to see what it does. Seeds, sprinklers and decorations can go on your belt (slots 6 to 9).'));
    for (const id of ids) {
      grid.append(h('button', { class: `cell${world.belt.includes(id) ? ' onbelt' : ''}`, title: ITEMS[id].name, onclick: () => {
        info.innerHTML = '';
        const it = ITEMS[id];
        info.append(h('div', { class: 'row' }, this.icon(id), h('div', { class: 'grow' }, h('b', {}, `${it.name} ×${world.inv[id]}`), h('small', {}, describe(id)))));
        if (['seed', 'sprinkler', 'decor'].includes(it.kind)) {
          info.append(h('div', { class: 'row' }, h('span', {}, 'Put on belt:'), ...[5, 6, 7, 8].map((s) => h('button', { class: `btn small${world.belt[s] === id ? ' primary' : ''}`, onclick: () => { world.setBelt(s, id); world.sel = s; onBelt?.(); this.openBag(world, onBelt); } }, String(s + 1)))));
        }
      } }, this.icon(id), h('span', { class: 'count' }, world.inv[id])));
    }
    body.append(grid, info);
    this.focusFirst();
  }

  // ---- journal
  openJournal(world, tab = 'goals') {
    this.world = world;
    if (this.open !== 'journal') this.show('journal', 'Farm Journal', { money: false, wide: true });
    this.tabs([['goals', '⭐ Goals'], ['collection', '📖 Collection'], ['friends', '💛 Friends'], ['calendar', '📅 Calendar']], tab, (t) => this.openJournal(world, t));
    const body = $('panel-body');
    body.innerHTML = '';
    if (tab === 'goals') {
      const done = GOALS.filter((g) => world.goalsDone[g.id]).length;
      body.append(h('p', { class: 'say' }, `${done} of ${GOALS.length} goals done. Earned in total: ${gold(world.earned)}.`));
      for (const g of GOALS) {
        const ok = !!world.goalsDone[g.id];
        const have = Math.min(g.n, world.statValue(g.stat));
        body.append(h('div', { class: `goal${ok ? ' done' : ''}` }, h('span', { class: 'check' }, ok ? '★' : '☆'), h('span', { class: 'grow' }, g.text), g.n > 1 && !ok ? h('small', {}, `${have.toLocaleString('en-US')}/${g.n.toLocaleString('en-US')}`) : null, g.reward ? h('small', { class: 'reward' }, `+${gold(g.reward)}`) : null));
      }
    } else if (tab === 'collection') {
      const book = (title, ids, have, names, iconFor) => {
        body.append(h('h3', {}, `${title} ${Object.keys(have).length}/${ids.length}`));
        const grid = h('div', { class: 'grid' });
        for (const id of ids) {
          const got = !!have[id];
          grid.append(h('div', { class: `cell${got ? '' : ' unknown'}`, title: got ? names(id) : '???' }, iconFor(id, got), h('span', { class: 'label' }, got ? names(id) : '???')));
        }
        body.append(grid);
      };
      book('Crops', CROP_IDS, world.collection.crops, (id) => CROPS[id].name, (id) => this.icon(id));
      book('Fish', FISH_IDS, world.collection.fish, (id) => FISH[id].name, (id) => this.icon(id));
      book('Critters', CRITTER_IDS, world.collection.critters, (id) => CRITTERS[id].name, (id, got) => h('span', { class: 'critter', style: `--c:${CRITTERS[id].color}` }, got ? '●' : '?'));
      book('Goods', Object.keys(GOODS), world.collection.goods, (id) => GOODS[id].name, (id) => this.icon(id));
    } else if (tab === 'friends') {
      for (const id of VILLAGER_IDS) {
        const v = VILLAGERS[id], s = world.villagers[id];
        const known = Object.entries(s.known).map(([item, r]) => h('span', { class: 'known', title: `${ITEMS[item].name}: ${r}` }, this.icon(item), REACTION_ICON[r]));
        body.append(h('div', { class: 'friend' }, h('img', { class: 'face', src: this.portraits[id], alt: '' }), h('div', { class: 'grow' },
          h('b', {}, s.met ? v.name : '???'), h('small', {}, s.met ? v.role : 'You haven\'t met yet. Look for the orange ! in town.'),
          heartsHtml(heartsOf(s.points)), h('div', { class: 'knowns' }, ...known))));
      }
      body.append(h('h3', {}, 'Animals'));
      for (const a of world.animals) body.append(h('div', { class: 'friend' }, this.icon(a.type === 'chicken' ? 'egg' : a.type === 'cow' ? 'milk' : 'goatmilk'), h('div', { class: 'grow' }, h('b', {}, `${a.name} the ${a.type}`), heartsHtml(Math.floor(a.points / HEART_POINTS)))));
    } else {
      const d = world.date;
      for (let si = 0; si < 4; si++) {
        const season = ['spring', 'summer', 'autumn', 'winter'][si];
        const cal = h('div', { class: `calendar${season === d.season ? ' now' : ''}` }, h('b', {}, `${SEASON_ICON[season]} ${SEASON_NAMES[season]}`));
        const row = h('div', { class: 'days' });
        for (let day = 1; day <= DAYS_PER_SEASON; day++) {
          const fest = FESTIVAL_IDS.find((f) => FESTIVALS[f].season === season && FESTIVALS[f].day === day);
          const today = season === d.season && day === d.day;
          row.append(h('div', { class: `day${today ? ' today' : ''}${fest ? ' fest' : ''}`, title: fest ? FESTIVALS[fest].name : day === MARKET_DAY ? 'Market day' : '' }, h('span', {}, ['M', 'T', 'W', 'T', 'F', 'S', 'S'][day - 1]), h('b', {}, day), fest ? '🎉' : day === MARKET_DAY ? '🧺' : ''));
        }
        cal.append(row);
        const f = FESTIVAL_IDS.find((id) => FESTIVALS[id].season === season);
        cal.append(h('small', {}, `${FESTIVALS[f].name}${world.festivalsWon[f] ? ' ✓ won' : ''}: ${FESTIVALS[f].desc}`));
        body.append(cal);
      }
    }
    this.focusFirst();
  }

  // ---- dialogue
  openDialogue(data) {
    const world = this.world;
    this.open = 'dialogue';
    this.panel.classList.add('hidden');
    const box = $('dialogue');
    box.classList.remove('hidden');
    $('dialogue-face').src = this.portraits[data.id];
    $('dialogue-name').textContent = VILLAGERS[data.id].name;
    const hearts = $('dialogue-hearts');
    hearts.innerHTML = '';
    hearts.append(heartsHtml(data.hearts));
    $('dialogue-line').textContent = data.line;
    const acts = $('dialogue-acts');
    acts.innerHTML = '';
    if (data.canGift && Object.keys(world.inv).some(giftable)) acts.append(h('button', { class: 'btn primary', onclick: () => this.openGift(data.id) }, '🎁 Give a gift'));
    this.sound.play('talk', { pitch: 330 + VILLAGER_IDS.indexOf(data.id) * 60, n: world.talkCount });
    this.focusFirst();
  }

  openGift(id) {
    const world = this.world;
    const acts = $('dialogue-acts');
    acts.innerHTML = '';
    $('dialogue-line').textContent = `What would you like to give ${VILLAGERS[id].name}?`;
    const grid = h('div', { class: 'grid small' });
    for (const item of Object.keys(world.inv).filter(giftable)) {
      const known = world.villagers[id].known[item];
      grid.append(h('button', { class: 'cell', title: ITEMS[item].name, onclick: () => {
        const r = world.gift(id, item);
        if (!r) return;
        $('dialogue-line').textContent = r.line;
        $('dialogue-hearts').innerHTML = '';
        $('dialogue-hearts').append(heartsHtml(r.hearts));
        acts.innerHTML = '';
        this.sound.play('gift', { love: r.reaction === 'love' });
        $('dialogue-bye').focus();
      } }, this.icon(item), known ? h('span', { class: 'react' }, REACTION_ICON[known]) : null, h('span', { class: 'count' }, world.inv[item])));
    }
    acts.append(grid);
    grid.querySelector('button')?.focus();
  }

  // ---- bedtime card
  showNight(s, world, saved) {
    const card = $('screen-night');
    card.classList.remove('hidden');
    const d = s.date;
    $('night-title').textContent = s.passedOut ? 'You dozed off on the way home...' : 'Sweet dreams!';
    const body = $('night-body');
    body.innerHTML = '';
    if (s.passedOut) body.append(h('p', { class: 'muted' }, 'Bram found you snoring by the road and helped you to bed. Try to sleep before 2 am!'));
    if (s.shipped.length) {
      const list = h('div', { class: 'shipped' }, ...s.shipped.map((x) => h('div', { class: 'srow' }, this.icon(x.id), h('span', { class: 'grow' }, `${ITEMS[x.id].name} ×${x.n}`), h('b', {}, gold(x.gold)))));
      body.append(h('h3', {}, 'Shipped overnight'), list, h('p', { class: 'total' }, `Total: ${gold(s.income)}`));
    } else body.append(h('p', { class: 'muted' }, 'Nothing was shipped today.'));
    if (s.newSeason) body.append(h('p', { class: 'season-banner' }, `${SEASON_ICON[d.season]} Welcome to ${SEASON_NAMES[d.season]}!${s.withered ? ` ${s.withered} out-of-season plant${s.withered > 1 ? 's' : ''} withered. Clear them with the hoe or scythe.` : ''}`));
    if (s.produce) body.append(h('p', {}, `🥚 Your animals left ${s.produce} gift${s.produce > 1 ? 's' : ''} in the pen.`));
    if (s.festival) body.append(h('p', { class: 'poster' }, `🎉 Today is the ${FESTIVALS[s.festival].name}! ${FESTIVALS[s.festival].desc} (${formatTime(FESTIVALS[s.festival].start)} to ${formatTime(FESTIVALS[s.festival].end)} in town)`));
    else if (d.day === MARKET_DAY) body.append(h('p', {}, '🧺 It\'s Saturday: the market stall is open in the plaza!'));
    body.append(h('p', {}, `${SEASON_NAMES[d.season]} ${d.day}, ${d.weekday} · ${WEATHER_ICON[s.weather]} ${WEATHER_NAME[s.weather]}${s.weather === 'rain' || s.weather === 'snow' ? ': your crops are watered!' : ''}`));
    body.append(h('p', { class: 'muted small' }, saved ? '✓ Game saved' : 'Saving is blocked in this browser, so progress will not be kept.'));
    $('btn-morning').focus();
    void world;
  }
}

function festProgress(w) {
  const f = w.fest;
  if (!f) return '';
  if (f.id === 'egghunt') return `${f.eggs}/${FESTIVALS.egghunt.goal} eggs`;
  if (f.id === 'lanterns') return `${f.lit.length}/${FESTIVALS.lanterns.goal} lanterns`;
  if (f.id === 'snow') return `${f.fish}/${FESTIVALS.snow.goal} fish from the town pond`;
  if (f.id === 'fair') return 'bring 3 items to the stall';
  return '';
}

function shopLine(w, tab) {
  if (tab === 'seeds') return `${SEASON_NAMES[w.season]} seeds are in! Remember, crops need water every day.`;
  if (tab === 'farm') return 'Happy animals make the best eggs and milk. Keep that trough full!';
  if (tab === 'upgrades') return 'Bram does the building. He works fast, too: it\'s ready right away.';
  return 'A farm should feel like home. Pretty things go anywhere on your land.';
}

const ORDER = { seed: 0, crop: 1, produce: 2, fish: 3, goods: 4, hay: 5, sprinkler: 6, decor: 7 };
const kindOrder = (id) => ORDER[ITEMS[id].kind] ?? 9;

function describe(id) {
  const it = ITEMS[id];
  if (it.kind === 'seed') { const c = CROPS[it.crop]; return `Plant in tilled soil. Grows in ${c.seasons.map((s) => SEASON_NAMES[s]).join(' and ')}, ${c.days} days${c.regrow ? `, then every ${c.regrow} days` : ''}. Sells for ${c.sell}g.`; }
  if (it.kind === 'sprinkler') return 'Place it in your field. Waters the 8 tiles around it every morning.';
  if (it.kind === 'decor') return 'Place it on your farm. Use the hoe or E to pick it up again.';
  if (it.kind === 'hay') return 'Put hay in the trough in the animal pen. Each animal eats one a night.';
  return `Sells for ${it.sell}g${it.kind !== 'goods' ? '' : '. Made in your kitchen.'}${giftable(id) ? ' Villagers might love it as a gift.' : ''}`;
}
