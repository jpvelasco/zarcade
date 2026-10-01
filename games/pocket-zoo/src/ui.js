// DOM menus: the habitat card, egg shop, keeper tasks, collection book,
// decorations, help and the HUD. Buttons call back into main.js actions.
import { BIOMES, ANIMALS, RARITY, RARITIES, animalsOf, DECOS, HABITAT_LEVELS, MAX_LEVEL, PLOTS_PER_BIOME, RANKS, JOY, MAX_STARS } from './data.js';
import { fmt, fmtRate } from './economy.js';
import { taskText, taskIcon, taskDone } from './tasks.js';
import { PAD_TOP } from './sprites.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COIN = '<span class="coin" aria-hidden="true"></span>';

export class UI {
  constructor({ zoo, sprites, actions, sound }) {
    this.zoo = zoo;
    this.sprites = sprites;
    this.actions = actions;
    this.sound = sound;
    this.kind = null;
    this.arg = null;
    this.bookBiome = 0;
    this.bookPick = null;
    this.lastCoins = '';
    $('sheet-close').addEventListener('click', () => this.actions.closeSheet());
    $('screen-sheet').addEventListener('pointerdown', (e) => { if (e.target.id === 'screen-sheet') this.actions.closeSheet(); });
    $('sheet-body').addEventListener('click', (e) => this.onClick(e));
  }

  setZoo(zoo) { this.zoo = zoo; }

  // ---------------------------------------------------------------- art helpers

  portrait(id, w = 70, { silhouette = false } = {}) {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(w * 1.1 * dpr);
    const ctx = c.getContext('2d');
    const img = silhouette ? this.sprites.silhouette(id) : this.sprites.animal(id);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  eggArt(kind, w = 56) {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(w * dpr);
    c.style.width = c.style.height = `${w}px`;
    c.getContext('2d').drawImage(this.sprites.egg(kind), 0, 0, c.width, c.height);
    return c;
  }

  decoArt(id, w = 80) {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(w * 1.1 * dpr);
    c.getContext('2d').drawImage(this.sprites.deco(id), 0, 0, c.width, c.height);
    return c;
  }

  costBtn(action, arg, cost, label, cls = 'primary', key = '') {
    const can = this.zoo.coins >= cost;
    return `<button class="btn ${cls}${can ? '' : ' cant'}" data-act="${action}" data-arg="${arg}" data-cost="${cost}" aria-disabled="${!can}"><span class="lbl">${label} · ${COIN}${fmt(cost)}</span>${key ? `<span class="key">${key}</span>` : ''}</button>`;
  }

  // ---------------------------------------------------------------- sheets

  open(kind, arg = null) {
    this.kind = kind;
    this.arg = arg;
    this.render();
    $('screen-sheet').classList.remove('hidden');
    const card = $('sheet-card');
    card.classList.toggle('narrow', kind === 'habitat' || kind === 'lot' || kind === 'help' || kind === 'spot');
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';
    const first = $('sheet-body').querySelector('.btn:not(.cant), .cell, .tab') || $('sheet-close');
    first?.focus({ preventScroll: true });
  }

  close() {
    this.kind = null;
    $('screen-sheet').classList.add('hidden');
  }

  get isOpen() { return !!this.kind; }

  render() {
    const body = $('sheet-body');
    const focusKey = document.activeElement?.dataset?.focus;
    body.innerHTML = '';
    const fn = {
      habitat: () => this.renderHabitat(this.arg),
      lot: () => this.renderLot(this.arg),
      eggs: () => this.renderEggs(),
      tasks: () => this.renderTasks(),
      book: () => this.renderBook(),
      decor: () => this.renderDecor(this.arg),
      help: () => this.renderHelp(),
    }[this.kind];
    fn?.();
    if (focusKey) body.querySelector(`[data-focus="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  // Cheap refresh while open: affordability only (keeps focus).
  refreshCosts() {
    if (!this.kind) return;
    for (const b of $('sheet-body').querySelectorAll('[data-cost]')) {
      const can = this.zoo.coins >= +b.dataset.cost;
      if (b.classList.contains('cant') === can) {
        b.classList.toggle('cant', !can);
        b.setAttribute('aria-disabled', String(!can));
      }
    }
  }

  title(t) { $('sheet-title').textContent = t; }

  renderHabitat(i) {
    const zoo = this.zoo;
    const h = zoo.habitat(i);
    const b = zoo.biomeOf(i);
    const biome = BIOMES[b];
    const name = biome.habitats[i % PLOTS_PER_BIOME];
    const body = $('sheet-body');
    if (!h.level) {
      this.title(`Empty plot`);
      const waiting = zoo.waitingIn(b);
      body.innerHTML = `<p class="sub">Build <b>${esc(name)}</b> in the ${esc(biome.name)}. It holds ${HABITAT_LEVELS[0].cap} animals to start, and more as you upgrade it.</p>
        ${waiting.length ? `<p class="sub">🏠 <b>${waiting.length}</b> ${waiting.length === 1 ? 'animal is' : 'animals are'} waiting to move in!</p>` : ''}
        <div class="portraits" id="hab-wait"></div>
        <div class="actions">${this.costBtn('build', i, zoo.buildCost(i), '🏗️ Build', 'primary', 'Enter')}</div>`;
      const wrap = $('hab-wait');
      for (const id of waiting.slice(0, 6)) wrap.appendChild(this.portraitCard(id));
      return;
    }
    this.title(`${name} ${'★'.repeat(h.level)}`);
    const cap = zoo.capacity(i);
    const rate = zoo.habitatRate(i);
    body.innerHTML = `<p class="sub">${esc(biome.name)} · Level ${h.level} · ${h.animals.length}/${cap} animals · ${COIN} <b>${fmtRate(rate)}</b>/s</p>
      <div class="portraits" id="hab-animals"></div>
      <div><b>Joy bonus</b> <span class="muted">+${Math.round(h.joy / 2)}% coins · pet or feed to fill it</span>
        <div class="bar joy"><i style="width:${h.joy}%"></i></div></div>
      <div class="actions" id="hab-actions"></div>`;
    const wrap = $('hab-animals');
    for (const id of h.animals) wrap.appendChild(this.portraitCard(id));
    for (let k = h.animals.length; k < cap; k++) {
      const e = document.createElement('div');
      e.className = 'portrait empty';
      e.textContent = 'Room!';
      wrap.appendChild(e);
    }
    const acts = $('hab-actions');
    let html = '';
    if (h.animals.length) {
      html += `<button class="btn pink" data-act="pet" data-arg="${i}" data-focus="pet">💗 Pet<small>free · +${JOY.pet} Joy</small><span class="key">X</span></button>`;
      html += this.costBtn('feed', i, zoo.snackCost(i), `🍎 Snack`, 'gold', 'F').replace('</button>', `<small>+${JOY.snack} Joy</small></button>`).replace('data-act="feed"', 'data-focus="feed" data-act="feed"');
    } else {
      html += `<p class="sub">Hatch a ${esc(biome.short)} egg to fill this habitat!</p>`;
    }
    if (h.level < MAX_LEVEL) {
      const next = HABITAT_LEVELS[h.level];
      const cur = HABITAT_LEVELS[h.level - 1];
      const extra = next.cap > cur.cap ? `room for ${next.cap}` : `coins ×${(next.mult / cur.mult).toFixed(2).replace(/0$/, '')}`;
      html += this.costBtn('upgrade', i, zoo.upgradeCost(i), `⬆️ Upgrade`, 'primary', 'U').replace('</button>', `<small>${extra}</small></button>`).replace('data-act="upgrade"', 'data-focus="upgrade" data-act="upgrade"');
    } else html += '<p class="sub">✨ Fully upgraded. Fancy!</p>';
    html += `<button class="btn" data-act="egg-biome" data-arg="${b}">🥚 ${esc(biome.short)} eggs</button>`;
    acts.innerHTML = html;
  }

  portraitCard(id) {
    const a = ANIMALS.find((x) => x.id === id);
    const d = document.createElement('div');
    d.className = 'portrait';
    d.appendChild(this.portrait(id, 70));
    const stars = this.zoo.state.animals[id]?.stars || 1;
    d.insertAdjacentHTML('beforeend', `<b>${esc(a.name)}</b><small>${'★'.repeat(stars)}</small>`);
    d.style.boxShadow = `0 3px 0 ${RARITY[a.rarity].color}`;
    return d;
  }

  renderLot(b) {
    const zoo = this.zoo;
    const biome = BIOMES[b];
    const next = b === zoo.nextBiome();
    this.title(biome.name);
    const body = $('sheet-body');
    body.innerHTML = `<p class="sub">${next ? `Open the ${esc(biome.name)} to meet seven new animals. It comes with your first habitat!` : `Open the ${esc(BIOMES[b - 1].name)} first.`}</p>
      <div class="portraits" id="lot-animals"></div>
      <div class="actions">${next ? this.costBtn('unlock', b, biome.unlock, '🔓 Open', 'primary', 'Enter') : ''}</div>`;
    const wrap = $('lot-animals');
    for (const a of animalsOf(biome.id)) {
      const d = document.createElement('div');
      d.className = 'portrait';
      d.appendChild(this.portrait(a.id, 70, { silhouette: true }));
      d.insertAdjacentHTML('beforeend', `<b>???</b><small style="color:${RARITY[a.rarity].color}">${RARITY[a.rarity].label}</small>`);
      wrap.appendChild(d);
    }
  }

  renderEggs() {
    const zoo = this.zoo;
    const s = zoo.state;
    this.title('Mystery Eggs');
    const body = $('sheet-body');
    const key = this.actions.dayKey();
    if (zoo.dailyAvailable(key)) {
      const fb = zoo.dailyBiome(key);
      const row = this.row('special', this.eggArt('daily'), `Daily Star Egg`, `Free today! From the ${BIOMES[fb].name}, never common.${s.daily.streak ? ` Streak: ${s.daily.streak} ${s.daily.streak === 1 ? 'day' : 'days'}` : ''}`,
        `<button class="btn gold" data-act="daily" data-focus="daily">⭐ Hatch free</button>`);
      body.appendChild(row);
    } else {
      body.insertAdjacentHTML('beforeend', `<p class="sub">⭐ Daily Star Egg claimed. A new one hatches tomorrow! Streak: <b>${s.daily.streak}</b> ${s.daily.streak === 1 ? 'day' : 'days'}.</p>`);
    }
    if (s.giftEggs > 0) body.insertAdjacentHTML('beforeend', `<p class="sub">🎁 You have <b>${s.giftEggs}</b> gift ${s.giftEggs === 1 ? 'egg' : 'eggs'}. Pick any biome below to hatch ${s.giftEggs === 1 ? 'it' : 'one'} for free.</p>`);
    for (let b = 0; b < BIOMES.length; b++) {
      const biome = BIOMES[b];
      if (!zoo.isUnlocked(b)) {
        if (b === zoo.nextBiome()) body.insertAdjacentHTML('beforeend', `<p class="sub">🔒 More eggs when you open the ${esc(biome.name)} (${fmt(biome.unlock)} coins).</p>`);
        continue;
      }
      const found = zoo.ownedCount(b);
      const total = animalsOf(biome.id).length;
      const room = this.roomIn(b);
      const note = found === total ? 'All found! Repeats add ★ stars.' : room > 0 ? `${found}/${total} found` : `${found}/${total} found · new friends will wait for a home`;
      let btns = this.costBtn('egg', b, zoo.eggPrice(b), 'Hatch', 'primary').replace('data-act="egg"', `data-focus="egg${b}" data-act="egg"`);
      if (s.giftEggs > 0) btns = `<button class="btn pink" data-act="gift" data-arg="${b}" data-focus="gift${b}">🎁 Gift egg</button>` + btns;
      body.appendChild(this.row('', this.eggArt(biome.id), `${biome.name}`, note, `<div class="row">${btns}</div>`));
    }
  }

  roomIn(b) {
    let room = 0;
    for (let p = 0; p < PLOTS_PER_BIOME; p++) {
      const i = b * PLOTS_PER_BIOME + p;
      if (this.zoo.habitat(i).level) room += this.zoo.capacity(i) - this.zoo.habitat(i).animals.length;
    }
    return room - this.zoo.waitingIn(b).length;
  }

  row(cls, art, title, text, right) {
    const d = document.createElement('div');
    d.className = `item ${cls}`;
    if (art) d.appendChild(art);
    d.insertAdjacentHTML('beforeend', `<div class="grow"><h3>${esc(title)}</h3><p>${text}</p></div>${right || ''}`);
    return d;
  }

  renderTasks() {
    const zoo = this.zoo;
    const s = zoo.state;
    this.title('Keeper Tasks');
    const body = $('sheet-body');
    const r = s.rank;
    const score = zoo.score();
    const next = RANKS[r + 1];
    const prev = RANKS[r].score;
    body.insertAdjacentHTML('beforeend', `<div class="item special"><div class="grow"><h3>🏆 ${esc(RANKS[r].name)}</h3>
      <p>${next ? `${score - prev} / ${next.score - prev} zoo points to <b>${esc(next.name)}</b> · each rank gives a gift egg` : 'The top rank. Your zoo is a legend!'}</p>
      ${next ? `<div class="bar rank"><i style="width:${Math.min(100, ((score - prev) / (next.score - prev)) * 100)}%"></i></div>` : ''}</div></div>`);
    s.tasks.list.forEach((t, k) => {
      const done = taskDone(t);
      const reward = t.reward.egg ? '🎁 Gift egg' : `${COIN} ${fmt(t.reward.coins)}`;
      const btn = done ? `<button class="btn primary" data-act="claim" data-arg="${k}" data-focus="claim${k}">Claim</button>` : `<span class="muted" style="font-weight:800">${reward}</span>`;
      const d = this.row(done ? 'done' : '', null, `${taskIcon(t)} ${taskText(t, fmt)}`, `${done ? `Done! Reward: ${reward}` : `${fmt(Math.floor(t.progress))} / ${fmt(t.goal)}`}`, btn);
      if (!done) d.querySelector('.grow').insertAdjacentHTML('beforeend', `<div class="bar"><i style="width:${(t.progress / t.goal) * 100}%"></i></div>`);
      body.appendChild(d);
    });
    body.insertAdjacentHTML('beforeend', `<p class="sub">New tasks appear as soon as you claim one. No timers, no rush.</p>`);
  }

  renderBook() {
    const zoo = this.zoo;
    this.title(`Collection Book · ${zoo.ownedCount()}/${ANIMALS.length}`);
    const body = $('sheet-body');
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    tabs.setAttribute('role', 'tablist');
    BIOMES.forEach((biome, b) => {
      const t = document.createElement('button');
      t.className = `tab${zoo.isUnlocked(b) ? '' : ' locked'}`;
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(b === this.bookBiome));
      t.dataset.act = 'book-tab';
      t.dataset.arg = b;
      t.dataset.focus = `tab${b}`;
      t.textContent = `${biome.short} ${zoo.ownedCount(b)}/${animalsOf(biome.id).length}`;
      tabs.appendChild(t);
    });
    body.appendChild(tabs);
    const grid = document.createElement('div');
    grid.className = 'book-grid';
    const list = animalsOf(BIOMES[this.bookBiome].id);
    for (const a of list) {
      const owned = zoo.state.animals[a.id];
      const cell = document.createElement('button');
      cell.className = `cell${owned ? '' : ' missing'}`;
      cell.dataset.act = 'book-pick';
      cell.dataset.arg = a.id;
      cell.dataset.focus = `cell-${a.id}`;
      cell.setAttribute('aria-pressed', String(this.bookPick === a.id));
      cell.setAttribute('aria-label', owned ? `${a.name}, ${RARITY[a.rarity].label}, ${owned.stars} stars` : `Not found yet, ${RARITY[a.rarity].label}`);
      cell.appendChild(this.portrait(a.id, 84, { silhouette: !owned }));
      cell.insertAdjacentHTML('beforeend', `<b>${owned ? esc(a.name) : '???'}</b><span class="r" style="background:${RARITY[a.rarity].color}">${RARITY[a.rarity].label}</span>
        <div class="stars">${owned ? '★'.repeat(owned.stars) + '☆'.repeat(MAX_STARS - owned.stars) : '&nbsp;'}</div>`);
      grid.appendChild(cell);
    }
    body.appendChild(grid);
    const pick = list.find((a) => a.id === this.bookPick);
    const fact = pick
      ? zoo.state.animals[pick.id] ? `<b>${esc(pick.name)}:</b> ${esc(pick.fact)}` : `A ${RARITY[pick.rarity].label.toLowerCase()} friend hides in ${esc(BIOMES[this.bookBiome].name)} eggs. Keep hatching!`
      : 'Pick an animal to read about it. Repeats add ★ stars, and each star earns 20% more coins.';
    body.insertAdjacentHTML('beforeend', `<div class="fact-box">${fact}</div>`);
  }

  renderDecor(focusId = null) {
    const zoo = this.zoo;
    const s = zoo.state;
    this.title('Decorations');
    const body = $('sheet-body');
    const bonus = Math.round(zoo.decoBonus() * 100);
    body.insertAdjacentHTML('beforeend', `<p class="sub">Decorations make visitors smile and add to all your coins. Placed now: <b>+${bonus}%</b></p>`);
    const grid = document.createElement('div');
    grid.className = 'deco-grid';
    for (const d of DECOS) {
      const card = document.createElement('div');
      card.className = 'deco-card';
      card.appendChild(this.decoArt(d.id));
      const owned = s.decos.owned.includes(d.id);
      const spot = zoo.spotOf(d.id);
      let btn;
      if (!owned) btn = this.costBtn('buy-deco', d.id, d.price, 'Buy', 'primary').replace('data-act="buy-deco"', `data-focus="deco-${d.id}" data-act="buy-deco"`);
      else if (spot < 0) btn = `<button class="btn pink" data-act="place" data-arg="${d.id}" data-focus="deco-${d.id}">Place it</button>`;
      else btn = `<div class="row"><button class="btn small" data-act="place" data-arg="${d.id}" data-focus="deco-${d.id}">Move</button><button class="btn small" data-act="store" data-arg="${d.id}">Put away</button></div>`;
      card.insertAdjacentHTML('beforeend', `<b>${esc(d.name)}</b><p>+${Math.round(d.bonus * 100)}% coins${owned && spot >= 0 ? ' · placed' : ''}</p>${btn}`);
      if (focusId === d.id) card.style.outline = '4px solid #4fb6ff';
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  renderHelp() {
    this.title('How to play');
    $('sheet-body').innerHTML = `<ul class="help">
      <li>🥚 <b>Hatch eggs</b> to find animals. Each biome has 7, from common to legendary.</li>
      <li>🏠 New animals move into a habitat of their biome. <b>Build</b> and <b>upgrade</b> habitats for more room and more coins.</li>
      <li>👋 <b>Visitors</b> walk the paths and drop coins while they watch your animals.</li>
      <li>💗 <b>Pet</b> animals (tap them) and give <b>snacks</b> for a Joy bonus of up to +50% coins.</li>
      <li>⭐ A free <b>Daily Star Egg</b> waits every day. 📋 <b>Keeper tasks</b> give coins and gift eggs.</li>
      <li>🌷 <b>Decorations</b> show up on your paths and raise every coin you earn.</li>
      <li>🔓 Open new biomes: Savanna, Jungle, Ocean Bay, Arctic and the Night House.</li>
      <li>💤 Your zoo keeps earning while you're away (up to 6 hours), so come back any time!</li>
    </ul>
    <p class="sub"><b>Keys:</b> WASD / arrows look around · + / − zoom · Q / E pick a habitat · Enter open · X pet · F snack · U upgrade · G eggs · T tasks · B book · C decor · M mute · Esc pause</p>`;
  }

  // ---------------------------------------------------------------- clicks

  onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const arg = b.dataset.arg;
    if (b.classList.contains('cant')) {
      this.actions.cant(+b.dataset.cost);
      return;
    }
    this.sound.play('click');
    const A = this.actions;
    switch (act) {
      case 'build': A.build(+arg); break;
      case 'upgrade': A.upgrade(+arg); break;
      case 'feed': A.feed(+arg); break;
      case 'pet': A.petHabitat(+arg); break;
      case 'unlock': A.unlock(); break;
      case 'egg': A.buyEgg(+arg); break;
      case 'gift': A.useGift(+arg); break;
      case 'daily': A.claimDaily(); break;
      case 'egg-biome': this.open('eggs'); break;
      case 'claim': A.claimTask(+arg); break;
      case 'buy-deco': A.buyDeco(arg); break;
      case 'place': A.startPlacing(arg); break;
      case 'store': A.storeDeco(arg); break;
      case 'book-tab': this.bookBiome = +arg; this.bookPick = null; this.render(); break;
      case 'book-pick': this.bookPick = arg; this.render(); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- HUD

  hud(zoo, dayKey) {
    const s = zoo.state;
    const coins = fmt(s.coins);
    if (coins !== this.lastCoins) {
      $('hud-coins').textContent = coins;
      this.lastCoins = coins;
    }
    $('hud-rate').textContent = `+${fmtRate(zoo.rate)}/s`;
    $('hud-rank').textContent = `🏆 ${RANKS[s.rank].name}`;
    const eggs = s.giftEggs + (zoo.dailyAvailable(dayKey) ? 1 : 0);
    badge('badge-eggs', eggs);
    badge('badge-tasks', s.tasks.list.filter(taskDone).length);
    badge('badge-decor', s.decos.owned.filter((id) => zoo.spotOf(id) < 0).length);
    $('tool-book-label').textContent = `${zoo.ownedCount()}/${ANIMALS.length}`;
  }
}

function badge(id, n) {
  const el = $(id);
  el.classList.toggle('hidden', !n);
  if (n && el.textContent !== String(n)) el.textContent = n;
}

export { RARITIES, PAD_TOP };
