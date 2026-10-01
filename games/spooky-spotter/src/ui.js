// The DOM side: the list of things to find, the mansion map, the ghost album,
// the curio cabinet, the help sheet, the results card and the toasts.

import { ITEM } from './items.js';
import { ROOMS, ROOM, ROOM_IDS, MODES, MODE, MODE_IDS, parTime } from './rooms.js';
import { GHOSTS, GHOST, ghostsOf } from './ghosts.js';
import { CURIOS, SHELVES } from './curios.js';
import { Renderer } from './render.js';
import { drawGhost, drawCurio } from './sprites.js';

export function el(tag, props = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of [].concat(kids)) if (kid) node.append(kid);
  return node;
}

const iconCache = new Map();

export function itemIcon(id, size = 46, silhouette = false) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const key = `${id}|${size}|${silhouette}|${dpr}`;
  let c = iconCache.get(key);
  if (!c) {
    c = Renderer.iconCanvas(id, size, { silhouette, dpr });
    iconCache.set(key, c);
  }
  const copy = el('canvas', { class: 'icon', width: c.width, height: c.height, 'aria-hidden': 'true' });
  copy.style.width = `${size}px`;
  copy.style.height = `${size}px`;
  copy.getContext('2d').drawImage(c, 0, 0);
  return copy;
}

export function ghostPortrait(ghost, size = 64, known = true) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const node = el('canvas', { class: 'portrait', width: Math.round(size * dpr), height: Math.round(size * 1.15 * dpr), 'aria-hidden': 'true' });
  node.style.width = `${size}px`;
  node.style.height = `${size * 1.15}px`;
  const c = node.getContext('2d');
  c.scale(dpr, dpr);
  if (known) {
    drawGhost(c, ghost, size, size * 1.15, 1.2, 0.9);
  } else {
    drawGhost(c, { ...ghost, hue: '#4a4458', glow: '#6a6478' }, size, size * 1.15, 0.4, 0.1, { alpha: 0.55 });
  }
  return node;
}

export function curioIcon(curio, size = 62, known = true) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const node = el('canvas', { class: 'curio', width: Math.round(size * dpr), height: Math.round(size * dpr), 'aria-hidden': 'true' });
  node.style.width = `${size}px`;
  node.style.height = `${size}px`;
  const c = node.getContext('2d');
  c.scale(dpr, dpr);
  drawCurio(c, curio.art, size, size, known ? curio.tint : '#453f52');
  if (!known) {
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = '#3a3448';
    c.fillRect(0, 0, size, size);
  }
  return node;
}

export function starRow(stars, max = 3, size = 'small') {
  return el('span', { class: `stars ${size}`, 'aria-label': `${stars} of ${max} stars` },
    Array.from({ length: max }, (_, i) => el('i', { class: i < stars ? 'on' : '', text: '★' })));
}

// ----------------------------------------------------------- the find list

export class ItemList {
  constructor(root, { onPick } = {}) {
    this.root = root;
    this.onPick = onPick;
    this.rows = new Map();
    this.selected = null;
  }

  build(round) {
    this.root.textContent = '';
    this.rows.clear();
    this.selected = null;
    if (round.mode === 'diff') {
      this.root.append(el('div', { class: 'diff-note' }, [
        el('b', { text: `${round.diff.changes.length} things changed` }),
        el('span', { text: 'Tap a difference in either picture.' }),
      ]));
      this.dots = el('div', { class: 'dots' },
        round.diff.changes.map((ch) => el('i', { class: 'dot', 'data-i': ch.index })));
      this.root.append(this.dots);
      return;
    }
    const silhouette = round.mode === 'hunt';
    const list = el('ul', { class: 'items', role: 'list' });
    for (const t of round.scene.targets) {
      if (t.secret) continue;
      const owner = GHOST[t.owner];
      const row = el('li', { class: 'item' }, [
        el('button', {
          class: 'item-btn',
          type: 'button',
          'data-id': t.id,
          title: silhouette ? 'Find this shape' : `Find the ${t.label.toLowerCase()}`,
          onclick: () => this.pick(t.id),
        }, [
          itemIcon(t.id, 44, silhouette),
          el('span', { class: 'item-text' }, [
            el('b', { text: silhouette ? 'What is this?' : t.label }),
            owner ? el('small', { text: `${owner.name}'s` }) : null,
          ]),
          el('span', { class: 'tick', text: '✓' }),
        ]),
      ]);
      list.append(row);
      this.rows.set(t.id, row);
    }
    this.root.append(list);
  }

  pick(id) {
    this.selected = id;
    for (const [key, row] of this.rows) row.classList.toggle('on', key === id);
    this.onPick?.(id);
  }

  step(dir) {
    const ids = [...this.rows.keys()].filter((id) => !this.rows.get(id).classList.contains('found'));
    if (!ids.length) return null;
    const at = ids.indexOf(this.selected);
    const next = ids[(at + dir + ids.length) % ids.length] ?? ids[0];
    this.pick(next);
    this.rows.get(next)?.querySelector('button')?.focus({ preventScroll: false });
    return next;
  }

  markFound(id) {
    const row = this.rows.get(id);
    if (!row) return;
    row.classList.add('found');
    row.classList.remove('on');
    if (this.selected === id) this.selected = null;
  }

  markDiff(index, total) {
    if (!this.dots) return;
    const dot = this.dots.querySelector(`[data-i="${index}"]`);
    if (dot) dot.classList.add('on');
    const done = this.dots.querySelectorAll('.on').length;
    this.dots.setAttribute('aria-label', `${done} of ${total} found`);
  }
}

// -------------------------------------------------------------- the sheets

export function mansionSvg(game) {
  const lit = ROOM_IDS.map((id) => game.isRestored(id));
  const win = (x, y, w, h, i) => `<rect class="win${lit[i] ? ' lit' : ''}" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`;
  return `
<svg class="mansion" viewBox="0 0 320 180" role="img" aria-label="Hollowhush Manor, ${lit.filter(Boolean).length} of 7 rooms awake">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a1430"/><stop offset="1" stop-color="#2e2448"/>
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#sky)"/>
  <circle cx="268" cy="34" r="13" fill="#f6ecc4" opacity="0.9"/>
  ${Array.from({ length: 26 }, (_, i) => {
    const x = (i * 97) % 316 + 2;
    const y = (i * 53) % 86 + 4;
    return `<circle cx="${x}" cy="${y}" r="${1 + (i % 3) * 0.4}" fill="#e8eeff" opacity="${0.4 + (i % 4) * 0.14}"/>`;
  }).join('')}
  <path d="M30 170 L30 84 L160 36 L290 84 L290 170 Z" fill="#3a2f4e" stroke="#5a4a74" stroke-width="2"/>
  <path d="M22 88 L160 30 L298 88 L160 62 Z" fill="#4a3a60"/>
  <path d="M148 36 L148 12 L166 12 L166 42 Z" fill="#4a3a60"/>
  <rect x="140" y="122" width="40" height="48" rx="4" fill="#5a4530"/>
  <circle cx="172" cy="148" r="2.5" fill="#e8c46a"/>
  ${win(48, 100, 26, 24, 0)}
  ${win(90, 100, 26, 24, 1)}
  ${win(146, 72, 28, 22, 2)}
  ${win(196, 100, 26, 24, 3)}
  ${win(240, 100, 26, 24, 4)}
  ${win(48, 140, 26, 22, 5)}
  ${win(240, 140, 26, 22, 6)}
  <ellipse cx="160" cy="174" rx="150" ry="8" fill="#20183a"/>
</svg>`;
}

export function renderMap(game, { onPlay, onDaily, dailyPlan }) {
  const wrap = el('div', { class: 'map-wrap' });
  wrap.append(el('div', { class: 'mansion-wrap', html: mansionSvg(game) }));

  const awake = game.restoredCount();
  wrap.append(el('p', {
    class: 'map-note',
    text: awake === ROOM_IDS.length
      ? 'Every room is awake. The ghosts are throwing a party downstairs.'
      : `${awake} of ${ROOM_IDS.length} rooms are awake. Clear a room to switch its lights on.`,
  }));

  const daily = game.state.daily;
  const dRoom = ROOM[dailyPlan.room];
  wrap.append(el('button', {
    class: `daily ${daily.done ? 'done' : ''}`,
    type: 'button',
    onclick: onDaily,
  }, [
    el('span', { class: 'daily-icon', text: daily.done ? '🌟' : '📅' }),
    el('span', { class: 'daily-text' }, [
      el('b', { text: daily.done ? "Today's room: done!" : "Today's room" }),
      el('small', { text: `${dRoom.name} · ${MODE[dailyPlan.mode].name}${daily.streak ? ` · ${daily.streak}-day streak` : ''}` }),
    ]),
    daily.done ? starRow(daily.stars) : el('span', { class: 'go', text: 'Play' }),
  ]));

  const grid = el('div', { class: 'rooms' });
  for (const room of ROOMS) {
    const open = game.isUnlocked(room.id);
    const card = el('div', { class: `room-card ${open ? '' : 'locked'} ${game.isRestored(room.id) ? 'awake' : ''}` });
    card.append(el('div', { class: 'room-head' }, [
      el('span', { class: 'room-dot', style: `background:${room.accent}` }),
      el('b', { text: room.name }),
      open ? null : el('span', { class: 'lock', text: '🔒' }),
    ]));
    card.append(el('p', { class: 'room-blurb', text: open ? room.blurb : 'Clear the room before it to open this door.' }));
    const modes = el('div', { class: 'modes' });
    for (const mode of MODES) {
      const slot = game.state.rooms[room.id][mode.id];
      const can = game.isModeOpen(room.id, mode.id);
      modes.append(el('button', {
        class: `mode ${can ? '' : 'off'} ${slot.cleared ? 'done' : ''}`,
        type: 'button',
        disabled: !can,
        title: can ? `${mode.name} · best ${slot.best ? `${slot.best.toFixed(1)}s` : '—'}` : 'Clear the find round first',
        onclick: () => onPlay(room.id, mode.id),
      }, [
        el('span', { class: 'mi', text: mode.icon }),
        el('span', { class: 'ml', text: mode.short }),
        starRow(slot.stars),
        el('small', { text: slot.best ? `${slot.best.toFixed(1)}s` : `par ${parTime(room.id, mode.id)}s` }),
      ]));
    }
    card.append(modes);
    grid.append(card);
  }
  wrap.append(grid);
  return wrap;
}

export function renderAlbum(game) {
  const wrap = el('div', { class: 'album' });
  wrap.append(el('p', { class: 'sheet-note', text: `${game.metGhosts()} of ${GHOSTS.length} ghosts have their things back.` }));
  for (const g of GHOSTS) {
    const known = game.ghostKnown(g.id);
    const row = el('div', { class: `album-row ${known ? '' : 'unknown'}` });
    row.append(ghostPortrait(g, 68, known));
    row.append(el('div', { class: 'album-text' }, [
      el('b', { text: known ? `${g.name}, ${g.title}` : '· · ·' }),
      el('small', { text: known ? g.bio : `Somebody lives in ${ROOM[g.room].name.toLowerCase()}. Bring them something of theirs.` }),
      known ? el('em', { text: `“${g.line}”` }) : null,
      known && game.state.ghosts[g.id].returned
        ? el('span', { class: 'count', text: `${game.state.ghosts[g.id].returned} things returned` })
        : null,
    ]));
    wrap.append(row);
  }
  return wrap;
}

export function renderCabinet(game) {
  const wrap = el('div', { class: 'cabinet' });
  wrap.append(el('p', { class: 'sheet-note', text: `${game.curioCount()} of ${CURIOS.length} curios on the shelves.` }));
  SHELVES.forEach((name, i) => {
    wrap.append(el('h3', { class: 'shelf-name', text: name }));
    const shelf = el('div', { class: 'shelf' });
    for (const curio of CURIOS.filter((c) => c.shelf === i)) {
      const known = game.hasCurio(curio.id);
      shelf.append(el('div', { class: `curio-slot ${known ? '' : 'unknown'}`, title: known ? curio.blurb : 'Still out there somewhere' }, [
        curioIcon(curio, 58, known),
        el('small', { text: known ? curio.name : '???' }),
      ]));
    }
    wrap.append(shelf);
  });
  return wrap;
}

export function renderHelp() {
  return el('div', { class: 'help' }, [
    el('p', { text: 'Hollowhush Manor is full of shy ghosts who have lost their favourite things. Find what is on the list and it floats back to its owner.' }),
    el('h3', { text: 'Searching' }),
    el('ul', {}, [
      el('li', { html: '<b>Click or tap</b> a thing you spot. Nothing is ever fully hidden.' }),
      el('li', { html: '<b>Drag</b> to look around, <b>wheel</b> or <b>pinch</b> to lean in.' }),
      el('li', { html: 'Tapping at random puffs up a little fog for a moment. It never costs you anything.' }),
      el('li', { html: 'The <b>lantern</b> (H) recharges on its own and lights up an area. Two unused lanterns earn the third star.' }),
    ]),
    el('h3', { text: 'Keyboard' }),
    el('ul', {}, [
      el('li', { html: '<b>Arrows</b> or <b>WASD</b> move the spotting ring, <b>Enter</b> or <b>Space</b> picks it up.' }),
      el('li', { html: '<b>[</b> and <b>]</b> step through the list, <b>+</b> and <b>−</b> zoom, <b>0</b> zooms out.' }),
      el('li', { html: '<b>H</b> lantern · <b>M</b> sound · <b>Esc</b> or <b>P</b> pause.' }),
    ]),
    el('h3', { text: 'Three ways to play each room' }),
    el('ul', {}, [
      el('li', { html: '<b>Find</b> the things on the list.' }),
      el('li', { html: '<b>Spot the difference</b> between two pictures of the room.' }),
      el('li', { html: '<b>Silhouette hunt</b>: the list is shapes only.' }),
    ]),
    el('h3', { text: 'Things to collect' }),
    el('ul', {}, [
      el('li', { text: 'A ghost album, a curio cabinet, and a mansion that lights up room by room.' }),
      el('li', { text: 'Keep an eye out for the manor mouse. He turns up in find rounds and he is very shy.' }),
      el('li', { text: 'A new room every day, with a streak for coming back.' }),
    ]),
  ]);
}

export function renderResult(out, round, game) {
  const room = ROOM[round.room];
  const wrap = el('div', { class: 'result' });
  wrap.append(el('div', { class: 'result-stars' }, starRow(out.stars, 3, 'big')));
  wrap.append(el('h2', { text: out.firstClear ? `${room.name} is awake!` : 'Found them all!' }));
  const crew = ghostsOf(round.room);
  const hero = crew[0];
  if (hero) {
    wrap.append(el('div', { class: 'result-ghost' }, [
      ghostPortrait(hero, 76, true),
      el('em', { text: `“${hero.line}”` }),
    ]));
  }
  const facts = el('div', { class: 'facts' }, [
    el('span', {}, [el('b', { text: `${out.seconds.toFixed(1)}s` }), el('small', { text: `par ${out.par}s` })]),
    el('span', {}, [el('b', { text: `${out.hints}` }), el('small', { text: out.hints === 1 ? 'lantern used' : 'lanterns used' })]),
    el('span', {}, [el('b', { text: `${out.found}` }), el('small', { text: 'things found' })]),
  ]);
  wrap.append(facts);
  if (out.newBest) wrap.append(el('p', { class: 'best-flag', text: '🏅 New best time!' }));
  const slot = game.state.rooms[round.room][round.mode];
  if (!out.newBest && slot.best) wrap.append(el('p', { class: 'muted small', text: `Your best here: ${slot.best.toFixed(1)}s` }));
  for (const id of out.curios) {
    const curio = CURIOS.find((cu) => cu.id === id);
    if (!curio) continue;
    wrap.append(el('div', { class: 'won-curio' }, [
      curioIcon(curio, 56, true),
      el('div', {}, [el('b', { text: `New curio: ${curio.name}` }), el('small', { text: curio.blurb })]),
    ]));
  }
  if (out.mouse) wrap.append(el('p', { class: 'mouse-flag', text: '🐭 You spotted the manor mouse!' }));
  if (out.unlockedRoom) wrap.append(el('p', { class: 'unlocked', text: `🚪 ${ROOM[out.unlockedRoom].name} is open now.` }));
  if (out.daily) {
    wrap.append(el('p', { class: 'streak', text: `📅 Daily room done · ${game.state.daily.streak}-day streak` }));
  }
  if (out.party) wrap.append(el('p', { class: 'party', text: '🎉 Every room is awake. The ghosts are throwing a party!' }));
  return wrap;
}

export function renderParty(game) {
  const wrap = el('div', { class: 'party-sheet' });
  wrap.append(el('p', { text: 'Every window in Hollowhush Manor is lit. The ghosts have pushed the furniture back, Twirl is winding the gramophone, and Mrs Pudding has made far too much cake.' }));
  const row = el('div', { class: 'party-row' });
  for (const g of GHOSTS) row.append(ghostPortrait(g, 62, game.ghostKnown(g.id)));
  wrap.append(row);
  wrap.append(el('p', { class: 'muted', text: 'Rooms stay open: play any of them again for a faster time, more stars, or the curios you are still missing.' }));
  wrap.append(el('div', { class: 'mansion-wrap', html: mansionSvg(game) }));
  return wrap;
}

export function toast(host, text, kind = '') {
  const node = el('div', { class: `toast ${kind}`, text });
  host.append(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 400);
  }, 2000);
  while (host.children.length > 4) host.firstChild.remove();
}
