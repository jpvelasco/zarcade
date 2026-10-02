// The DOM panels: the discovery book, the pal album, pal requests, the daily
// mystery and the help page. Everything here reads the Alchemy state and calls
// back into `actions`; it never changes the rules itself.
import { ITEM, ITEMS, PALS, PAL, BRANCHES, branchOf, DISCOVERIES } from './recipes.js';
import { ROOMS, requestText, riddleFor } from './alchemy.js';
import { drawItem, drawSilhouette, drawPal, drawPalSilhouette } from './art.js';

const $ = (id) => document.getElementById(id);

export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function art(draw, size) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(size * dpr);
  c.height = Math.round(size * dpr);
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(ctx, size);
  return c;
}

export function itemArt(id, size, known = true) {
  return art((ctx) => (known ? drawItem(ctx, id, size) : drawSilhouette(ctx, id, size)), size);
}

export function palArt(id, size, known = true) {
  return art((ctx) => (known ? drawPal(ctx, id, size, false) : drawPalSilhouette(ctx, id, size)), size);
}

export class UI {
  constructor({ alchemy, actions, sound }) {
    this.a = alchemy;
    this.actions = actions;
    this.sound = sound;
    this.kind = null;
    this.tab = 'pals';
    this.picked = null;
    this.isOpen = false;
  }

  open(kind, arg) {
    this.kind = kind;
    if (kind === 'book') {
      this.tab = arg || this.tab;
      this.picked = null;
    }
    this.isOpen = true;
    $('screen-sheet').classList.remove('hidden');
    this.render();
    $('sheet-close').focus({ preventScroll: true });
  }

  close() {
    this.isOpen = false;
    this.kind = null;
    $('screen-sheet').classList.add('hidden');
  }

  render() {
    if (!this.isOpen) return;
    const body = $('sheet-body');
    body.textContent = '';
    const card = $('sheet-card');
    card.classList.toggle('narrow', this.kind === 'daily' || this.kind === 'help');
    switch (this.kind) {
      case 'book': $('sheet-title').textContent = 'Discovery Book'; this.book(body); break;
      case 'quests': $('sheet-title').textContent = 'Pal Requests'; this.quests(body); break;
      case 'daily': $('sheet-title').textContent = 'Mystery Potion'; this.daily(body); break;
      default: $('sheet-title').textContent = 'How to play'; this.help(body); break;
    }
  }

  // ------------------------------------------------------------------ book

  book(body) {
    const a = this.a;
    const head = el('p', 'sub');
    head.append(
      el('b', null, `${a.discovered}/${DISCOVERIES.length}`), ' discoveries · ',
      el('b', null, `${a.palCount}/${PALS.length}`), ' pals · ',
      el('b', null, `📜 ${a.state.scrolls}`), ' hint scrolls',
    );
    body.appendChild(head);

    const tabs = el('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    const pages = [{ id: 'pals', name: 'Pals' }, ...BRANCHES];
    for (const page of pages) {
      const b = el('button', 'tab', page.name);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(page.id === this.tab));
      b.addEventListener('click', () => {
        this.tab = page.id;
        this.picked = null;
        this.sound.play('click');
        this.render();
      });
      tabs.appendChild(b);
    }
    body.appendChild(tabs);

    if (this.tab === 'pals') return this.palsPage(body);

    const ids = ITEMS.filter((it) => it.kind !== 'base' && branchOf(it.id) === this.tab).map((it) => it.id);
    const found = ids.filter((id) => a.knows(id)).length;
    body.appendChild(el('p', 'sub', `${found} of ${ids.length} found on this shelf.`));
    body.appendChild(this.detail(this.picked));
    const grid = el('div', 'book-grid');
    for (const id of ids) {
      const known = a.knows(id);
      const cell = el('button', `cell${known ? '' : ' missing'}`);
      cell.setAttribute('aria-pressed', String(this.picked === id));
      cell.appendChild(itemArt(id, 60, known));
      cell.appendChild(el('b', null, known ? ITEM[id].name : '???'));
      if (known && ITEM[id].pal) cell.appendChild(el('span', 'r', 'potion'));
      if (a.state.unseen[id]) cell.appendChild(el('span', 'dot'));
      cell.addEventListener('click', () => {
        this.picked = this.picked === id ? null : id;
        if (known) a.seen(id);
        this.sound.play('click');
        this.render();
      });
      grid.appendChild(cell);
    }
    body.appendChild(grid);
  }

  detail(id) {
    const box = el('div', 'fact-box');
    if (!id) {
      box.appendChild(el('p', 'muted', 'Pick anything to see what it is and how it is made. Silhouettes are things you have not found yet — a 📜 hint scroll shows one ingredient at a time.'));
      return box;
    }
    const a = this.a;
    const it = ITEM[id];
    const known = a.knows(id);
    box.appendChild(el('h3', null, known ? it.name : 'Not found yet'));
    box.appendChild(el('p', null, known ? it.blurb : `Something ${it.tags.slice(0, 2).join(' and ')}.`));
    if (known && it.pal) {
      const pal = PAL[it.pal];
      const row = el('div', 'pal-row');
      row.appendChild(palArt(it.pal, 56, !!a.state.pals[it.pal]));
      const side = el('div', 'grow');
      side.appendChild(el('b', null, pal.name));
      side.appendChild(el('p', null, `${pal.species} · ${pal.bio}`));
      row.appendChild(side);
      box.appendChild(row);
    }
    const recipe = el('div', 'recipe');
    const shown = a.revealed(id);
    shown.forEach((input, i) => {
      if (i) recipe.appendChild(el('span', 'plus', '+'));
      if (input) {
        const chip = el('span', 'chip');
        chip.appendChild(itemArt(input, 34, true));
        chip.appendChild(el('small', null, ITEM[input].name));
        recipe.appendChild(chip);
      } else {
        recipe.appendChild(el('span', 'chip unknown', '?'));
      }
    });
    box.appendChild(recipe);
    if (!known) {
      const left = it.inputs.length - (a.state.reveals[id] || 0);
      const btn = el('button', 'btn small gold', left ? `📜 Reveal one (1 scroll)` : 'All revealed');
      btn.disabled = !left || a.state.scrolls < 1;
      btn.addEventListener('click', () => {
        const res = a.reveal(id);
        if (res.ok) this.sound.play('reveal');
        else this.sound.play('nope');
        this.actions.afterChange();
        this.render();
      });
      box.appendChild(btn);
      if (left && a.state.scrolls < 1) box.appendChild(el('p', 'muted small', 'Find three more things to earn another scroll.'));
    }
    return box;
  }

  palsPage(body) {
    const a = this.a;
    body.appendChild(el('p', 'sub', `${a.palCount} of ${PALS.length} pals have moved in. Each one comes from its own potion.`));
    body.appendChild(this.palDetail(this.picked));
    const grid = el('div', 'book-grid');
    for (const pal of PALS) {
      const has = !!a.state.pals[pal.id];
      const cell = el('button', `cell${has ? '' : ' missing'}`);
      cell.setAttribute('aria-pressed', String(this.picked === pal.id));
      cell.appendChild(palArt(pal.id, 64, has));
      cell.appendChild(el('b', null, has ? pal.name : '???'));
      cell.appendChild(el('span', 'r', has ? ROOMS[a.roomOf(pal.id)].name : pal.species));
      cell.addEventListener('click', () => {
        this.picked = this.picked === pal.id ? null : pal.id;
        this.sound.play('click');
        this.render();
      });
      grid.appendChild(cell);
    }
    body.appendChild(grid);
    const rooms = el('div', 'rooms');
    rooms.appendChild(el('h3', null, 'Treehouse rooms'));
    ROOMS.forEach((room, i) => {
      const open = i < a.state.rooms;
      const row = el('div', `room-row${open ? '' : ' locked'}`);
      row.appendChild(el('b', null, room.name));
      row.appendChild(el('span', null, open ? room.blurb : `Opens at ${room.at} pals`));
      rooms.appendChild(row);
    });
    body.appendChild(rooms);
  }

  palDetail(id) {
    const box = el('div', 'fact-box');
    const pal = PAL[id];
    if (!pal) {
      box.appendChild(el('p', 'muted', 'Pick a pal to read about them. Tap a pal in the treehouse to say hello.'));
      return box;
    }
    const a = this.a;
    const has = !!a.state.pals[id];
    const potion = ITEMS.find((it) => it.pal === id);
    box.appendChild(el('h3', null, has ? `${pal.name} the ${pal.species}` : 'Not hatched yet'));
    box.appendChild(el('p', null, has ? pal.bio : `A ${pal.species} is waiting for somebody to brew the right potion.`));
    const row = el('div', 'pal-row');
    row.appendChild(itemArt(potion.id, 44, a.knows(potion.id)));
    const side = el('div', 'grow');
    side.appendChild(el('b', null, a.knows(potion.id) ? potion.name : 'An unknown potion'));
    side.appendChild(el('p', null, has ? `Lives in the ${ROOMS[a.roomOf(id)].name}.` : 'Brew it and they move in.'));
    row.appendChild(side);
    box.appendChild(row);
    return box;
  }

  // ---------------------------------------------------------------- quests

  quests(body) {
    const a = this.a;
    if (!a.palCount) {
      body.appendChild(el('p', 'sub', 'Brew your first potion and a pal will move in. Pals are the ones who ask for things!'));
      return;
    }
    body.appendChild(el('p', 'sub', `Each pal wants one thing (up to three at a time). Bring it and they hand over a 📜 hint scroll. You have ${a.state.scrolls}.`));
    a.state.requests.forEach((req, i) => {
      const item = el('div', 'item');
      item.appendChild(palArt(req.pal, 56, true));
      const grow = el('div', 'grow');
      grow.appendChild(el('h3', null, requestText(req)));
      grow.appendChild(el('p', null, req.told ? `They mean: ${ITEM[req.target].name}.` : 'Brew something that matches and they will know.'));
      item.appendChild(grow);
      if (!req.told) {
        const btn = el('button', 'btn small gold', '📜 Ask');
        btn.disabled = a.state.scrolls < 1;
        btn.addEventListener('click', () => {
          const res = a.tellRequest(i);
          this.sound.play(res.ok ? 'reveal' : 'nope');
          this.actions.afterChange();
          this.render();
        });
        item.appendChild(btn);
      } else {
        item.appendChild(itemArt(req.target, 44, true));
      }
      body.appendChild(item);
    });
  }

  // ----------------------------------------------------------------- daily

  daily(body) {
    const a = this.a;
    const d = a.ensureDaily(this.actions.dayKey());
    const done = d.done;
    body.appendChild(el('p', 'sub', done ? 'Solved! A new mystery arrives tomorrow.' : 'One mystery potion a day. Here is the riddle:'));
    const scroll = el('div', `riddle${done ? ' done' : ''}`);
    if (done) {
      scroll.appendChild(itemArt(d.id, 72, true));
      scroll.appendChild(el('h3', null, ITEM[d.id].name));
      scroll.appendChild(el('p', null, ITEM[d.id].blurb));
    } else {
      for (const line of riddleFor(d.id)) scroll.appendChild(el('p', null, line));
    }
    body.appendChild(scroll);
    const streak = el('p', 'streak');
    streak.append(
      el('b', null, `⭐ ${d.streak}`), done ? ' day streak' : ' day streak so far',
      d.best > d.streak ? ` · best ${d.best}` : '',
    );
    body.appendChild(streak);
    body.appendChild(el('p', 'muted small', 'Brewing the mystery potion is worth two hint scrolls. Miss a day and the streak just starts again — no fuss.'));
  }

  // ------------------------------------------------------------------ help

  help(body) {
    const list = el('ul', 'help');
    const lines = [
      '<b>Drag</b> an ingredient from the shelf into the cauldron, or just <b>tap</b> it. Two or three at a time.',
      'Press <b>Brew</b> (or click the cauldron, or press <b>Space</b>) to see what happens.',
      'Nothing is ever wasted: ingredients never run out, and a mix with no recipe only makes a silly puff — plus a hint.',
      'A <b>potion</b> summons a pal. Pals move into the treehouse, wander about, play and nap. <b>Tap a pal</b> to say hello.',
      'More pals open more rooms: Mossy Nook at 3, Cloud Loft at 7, Root Cellar at 12, Star Deck at 18, Dream Attic at 25.',
      'Every third discovery earns a <b>📜 hint scroll</b>. Spend them in the book to reveal a recipe one ingredient at a time, or ask a pal exactly what it wants.',
      'The <b>mystery potion</b> changes every day and keeps a gentle streak.',
      'Keyboard: <b>arrow keys</b> move along the shelf, <b>Enter</b> adds, <b>Backspace</b> takes one back, <b>Space</b> brews, <b>B</b> book, <b>Q</b> requests, <b>D</b> daily, <b>Esc</b> pause.',
    ];
    for (const line of lines) {
      const li = document.createElement('li');
      li.innerHTML = line;
      list.appendChild(li);
    }
    body.appendChild(list);
  }
}
