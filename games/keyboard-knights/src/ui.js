// Menu screens built from the save: quest map, lessons, wardrobe, bestiary
// and stats (with the WPM and accuracy charts and the weak-key heat map).
import { STAGES, LESSONS, REGIONS, BESTIARY, STAGES_PER_REGION } from './stages.js';
import { ITEMS, SLOTS, isOwned, isStageUnlocked, regionStars, totalStars, MAX_STARS, nextStageIndex } from './progress.js';
import { monsterSprite, silhouetteSprite, knightSprite, swordSprite, petSprite } from './sprites.js';
import { ROWS } from './keys.js';
import { weakness, weakKeys } from './stats.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const starsText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

// Paint a sprite into a small canvas element for the menus.
export function spriteCanvas(source, css = 72, { flip = false } = {}) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(css * dpr);
  c.style.width = c.style.height = `${css}px`;
  const g = c.getContext('2d');
  if (source) {
    if (flip) { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(source, 0, 0, c.width, c.height);
  }
  return c;
}

// A knight with sword and pet, for the wardrobe and title.
export function knightPreview(look, css = 140) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(css * 1.4 * dpr);
  c.height = Math.round(css * dpr);
  c.style.width = `${css * 1.4}px`;
  c.style.height = `${css}px`;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const px = Math.round(css * dpr * 1.5);
  const k = css * 0.9;
  const kx = css * 0.75;
  const pet = petSprite(look.pet, px);
  if (pet) g.drawImage(pet, kx - k * 0.95, css - k * 0.5, k * 0.5, k * 0.5);
  g.drawImage(knightSprite(look.armour, 0, px), kx - k / 2, css - k * 0.98, k, k);
  g.save();
  g.translate(kx + k * 0.2, css - k * 0.4);
  g.rotate(-0.35);
  const sw = k * 0.8;
  g.drawImage(swordSprite(look.sword, px), -sw / 2, -sw * 0.88, sw, sw);
  g.restore();
  return c;
}

// ------------------------------------------------------------ quest map

export function renderMap(root, save, { onStage }) {
  root.innerHTML = '';
  const nextIdx = nextStageIndex(save);
  REGIONS.forEach((reg, r) => {
    const own = STAGES.filter((s) => s.region === r);
    const open = isStageUnlocked(save, r * STAGES_PER_REGION);
    const card = document.createElement('section');
    card.className = `region${open ? '' : ' locked'}`;
    card.style.setProperty('--accent', reg.accent);
    card.style.setProperty('--sky1', reg.sky[0]);
    card.style.setProperty('--sky2', reg.sky[1]);
    card.innerHTML = `<header><h3>${esc(reg.name)}</h3><span class="pill">★ ${regionStars(save, r)} / ${own.length * 3}</span></header>
      <p class="muted">${open ? esc(reg.blurb) : 'Beat the boss before this to open the gate'}</p>`;
    const path = document.createElement('div');
    path.className = 'path';
    own.forEach((st, i) => {
      const idx = r * STAGES_PER_REGION + i;
      const unlocked = isStageUnlocked(save, idx);
      const stars = save.stars[st.id] || 0;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `node${st.boss ? ' boss' : ''}${stars ? ' done' : ''}${idx === nextIdx && unlocked ? ' next' : ''}`;
      b.disabled = !unlocked;
      b.innerHTML = `<span class="n">${st.boss ? '' : i + 1}</span><span class="s">${stars ? starsText(stars) : unlocked ? '' : '🔒'}</span>`;
      if (st.boss) {
        const img = unlocked ? monsterSprite(st.boss, 128) : silhouetteSprite(st.boss, 128);
        b.prepend(spriteCanvas(img, 44));
      }
      b.title = st.name;
      b.setAttribute('aria-label', `${reg.name} ${st.boss ? 'boss' : `stage ${i + 1}`}: ${st.name}${unlocked ? '' : ' (locked)'}${stars ? `, ${stars} stars` : ''}`);
      b.addEventListener('click', () => onStage(idx));
      const label = document.createElement('span');
      label.className = 'node-name';
      label.textContent = st.name;
      const wrap = document.createElement('div');
      wrap.className = 'node-wrap';
      wrap.append(b, label);
      path.appendChild(wrap);
    });
    card.appendChild(path);
    root.appendChild(card);
  });
}

// ------------------------------------------------------------ lessons

export function renderLessons(root, save, { onLesson }) {
  root.innerHTML = '';
  LESSONS.forEach((l, i) => {
    const stars = save.stars[l.id] || 0;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `lesson${stars ? ' done' : ''}`;
    const keys = l.newKeys[0] === 'shift' ? '⇧ Aa' : l.newKeys[0] === 'punct' ? ', . ? !' : l.newKeys.join(' ').toUpperCase();
    b.innerHTML = `<span class="lesson-n">${i + 1}</span><span class="lesson-keys">${esc(keys)}</span><span class="lesson-name">${esc(l.name)}</span><span class="lesson-stars">${stars ? starsText(stars) : '☆☆☆'}</span>`;
    b.setAttribute('aria-label', `Lesson ${i + 1}: ${l.name}${stars ? `, ${stars} stars` : ''}`);
    b.addEventListener('click', () => onLesson(i));
    root.appendChild(b);
  });
}

// ------------------------------------------------------------ wardrobe

const SLOT_NAMES = { armour: 'Armour', sword: 'Swords', pet: 'Pets' };

export function renderWardrobe(root, preview, save, { onEquip }) {
  preview.innerHTML = '';
  preview.appendChild(knightPreview(save.equipped, 120));
  root.innerHTML = '';
  for (const slot of SLOTS) {
    const sec = document.createElement('section');
    sec.className = 'ward-slot';
    sec.innerHTML = `<h3>${SLOT_NAMES[slot]}</h3>`;
    const grid = document.createElement('div');
    grid.className = 'ward-grid';
    for (const item of ITEMS[slot]) {
      const owned = isOwned(save, slot, item.id);
      const on = save.equipped[slot] === item.id;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ward-item${owned ? '' : ' locked'}${on ? ' on' : ''}`;
      b.disabled = !owned;
      let img = null;
      if (slot === 'armour') img = knightSprite(item.id, 0, 128);
      else if (slot === 'sword') img = swordSprite(item.id, 128);
      else img = petSprite(item.id, 128);
      const cv = spriteCanvas(img, 56);
      if (!owned) cv.classList.add('silhouette');
      b.appendChild(cv);
      const name = document.createElement('span');
      name.className = 'ward-name';
      name.textContent = owned ? item.name : '???';
      const hint = document.createElement('span');
      hint.className = 'ward-hint';
      hint.textContent = owned ? (on ? 'Wearing' : 'Tap to wear') : item.hint;
      b.append(name, hint);
      b.setAttribute('aria-label', owned ? `${item.name}${on ? ', equipped' : ''}` : `Locked: ${item.hint}`);
      b.addEventListener('click', () => onEquip(slot, item.id));
      grid.appendChild(b);
    }
    sec.appendChild(grid);
    root.appendChild(sec);
  }
}

// ------------------------------------------------------------ bestiary

export function renderBestiary(root, save) {
  root.innerHTML = '';
  for (const b of BESTIARY) {
    const seen = save.bestiary[b.id] || 0;
    const card = document.createElement('div');
    card.className = `beast${seen ? '' : ' unseen'}${b.boss ? ' boss' : ''}`;
    card.appendChild(spriteCanvas(seen ? monsterSprite(b.id, 128) : silhouetteSprite(b.id, 128), 64));
    const text = document.createElement('div');
    text.innerHTML = seen
      ? `<b>${esc(b.name)}</b><span class="muted">${esc(b.fact)}</span><span class="count">Poofed ×${seen}</span>`
      : `<b>???</b><span class="muted">Found in ${esc(REGIONS[b.region].name)}${b.boss ? ' (boss)' : ''}</span>`;
    card.appendChild(text);
    root.appendChild(card);
  }
}

// ------------------------------------------------------------ stats

function lineChart(points, { max, min = 0, unit, format = (v) => v, label }) {
  const W = 320;
  const H = 120;
  const L = 34;
  const R = 8;
  const T = 10;
  const B = 18;
  const n = points.length;
  const x = (i) => L + (n <= 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const y = (v) => T + (1 - (v - min) / (max - min || 1)) * (H - T - B);
  const ticks = [min, (min + max) / 2, max];
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">`;
  for (const t of ticks) {
    svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${format(t)}</text>`;
  }
  svg += `<text class="axis" x="${L}" y="${H - 3}">older</text><text class="axis" x="${W - R}" y="${H - 3}" text-anchor="end">latest</text>`;
  if (n > 1) svg += `<polyline class="line" points="${points.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}"/>`;
  points.forEach((p, i) => {
    svg += `<g class="pt"><circle class="hit" cx="${x(i)}" cy="${y(p.v)}" r="9"/><circle class="dot" cx="${x(i)}" cy="${y(p.v)}" r="4"/><title>${esc(p.d)}: ${format(p.v)}${unit}</title></g>`;
  });
  if (n) {
    const last = points[n - 1];
    svg += `<text class="val" x="${Math.min(W - R - 2, x(n - 1))}" y="${Math.max(12, y(last.v) - 9)}" text-anchor="end">${format(last.v)}${unit}</text>`;
  }
  return `${svg}</svg>`;
}

export function renderStats(root, save) {
  const h = save.history.slice(-30);
  const accAvg = h.length ? h.reduce((a, r) => a + r.acc, 0) / h.length : 0;
  const tiles = [
    ['Best speed', save.bestWpm ? `${save.bestWpm} WPM` : '—'],
    ['Accuracy (recent)', h.length ? `${Math.round(accAvg * 100)}%` : '—'],
    ['Words poofed', save.words.toLocaleString('en-US')],
    ['Stars', `★ ${totalStars(save)} / ${MAX_STARS}`],
    ['Best combo', save.bestCombo || '—'],
    ['Daily streak', save.daily.best ? `${save.daily.streak} (best ${save.daily.best})` : '—'],
  ];
  let html = `<div class="tiles">${tiles.map(([a, b]) => `<div class="tile"><span>${a}</span><b>${b}</b></div>`).join('')}</div>`;
  if (h.length >= 1) {
    const maxW = Math.max(10, Math.ceil(Math.max(...h.map((r) => r.wpm)) / 10) * 10);
    html += `<div class="charts"><figure><figcaption>Speed (words per minute), last ${h.length} run${h.length === 1 ? '' : 's'}</figcaption>${lineChart(h.map((r) => ({ v: r.wpm, d: r.d })), { max: maxW, unit: ' WPM', label: 'Words per minute over recent runs' })}</figure>`;
    const minA = Math.min(0.5, Math.floor(Math.min(...h.map((r) => r.acc)) * 10) / 10);
    html += `<figure><figcaption>Accuracy, last ${h.length} run${h.length === 1 ? '' : 's'}</figcaption>${lineChart(h.map((r) => ({ v: r.acc, d: r.d })), { min: minA, max: 1, unit: '', format: (v) => `${Math.round(v * 100)}%`, label: 'Accuracy over recent runs' })}</figure></div>`;
  } else {
    html += '<p class="muted center">Finish a stage to start your speed chart!</p>';
  }
  const weak = weakKeys(save.keyStats, 3);
  html += `<h3 class="center">Key practice map</h3><p class="muted center">${weak.length ? `Keys to practise: <b>${weak.map((k) => esc(k.toUpperCase())).join(' ')}</b>. The game sends more words with them.` : 'Type a little more and the keys you find tricky will light up here.'}</p>`;
  html += '<div class="heat">';
  for (const row of ROWS) {
    html += '<div class="heat-row">';
    for (const k of row) {
      const s = save.keyStats[k];
      const w = s && s.n >= 3 ? Math.min(1, weakness(save.keyStats, k) / 1.2) : null;
      const step = w === null ? 'none' : w < 0.2 ? 0 : w < 0.35 ? 1 : w < 0.55 ? 2 : 3;
      html += `<span class="heat-key h-${step}" title="${esc(k)}: ${s ? `${Math.round((1 - s.e) * 100)}% right` : 'not typed yet'}">${esc(k)}</span>`;
    }
    html += '</div>';
  }
  html += '</div><p class="heat-legend"><span class="heat-key h-0"></span> easy <span class="heat-key h-1"></span> good <span class="heat-key h-2"></span> tricky <span class="heat-key h-3"></span> practise <span class="heat-key h-none"></span> not yet</p>';
  root.innerHTML = html;
}
