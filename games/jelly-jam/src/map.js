// The reef map: a winding trail of levels through four areas.
import { LEVELS, AREAS, GOAL_ART } from './levels.js';

const W = 360;
const ROW = 64;
const HEAD = 94;

export function nodePosition(level) {
  const area = AREAS[level.area];
  const within = level.id - area.from;
  const bandTop = AREAS.slice(0, level.area).reduce((y, a) => y + HEAD + (a.to - a.from + 1) * ROW, 0);
  return {
    x: W / 2 + Math.sin(within * 0.92 + level.area * 1.3) * 118,
    y: bandTop + HEAD + within * ROW,
    bandTop,
    bandHeight: HEAD + (area.to - area.from + 1) * ROW,
  };
}

export function mapHeight() {
  return AREAS.reduce((y, a) => y + HEAD + (a.to - a.from + 1) * ROW, 0) + 30;
}

export function renderMap(holder, save, onPick) {
  const height = mapHeight();
  const parts = [];
  parts.push(`<svg viewBox="0 0 ${W} ${height}" xmlns="http://www.w3.org/2000/svg" role="list" aria-label="Reef map">`);
  parts.push(`<defs>
    <radialGradient id="node-open" cx="38%" cy="32%"><stop offset="0%" stop-color="#9fe8ff"/><stop offset="60%" stop-color="#2f9fd8"/><stop offset="100%" stop-color="#14608f"/></radialGradient>
    <radialGradient id="node-done" cx="38%" cy="32%"><stop offset="0%" stop-color="#d8fff2"/><stop offset="55%" stop-color="#4ef0c4"/><stop offset="100%" stop-color="#149b7c"/></radialGradient>
  </defs>`);

  AREAS.forEach((area, index) => {
    const first = LEVELS[area.from - 1];
    const { bandTop, bandHeight } = nodePosition(first);
    parts.push(`<g class="area-band"><rect x="6" y="${bandTop + 8}" width="${W - 12}" height="${bandHeight - 16}" rx="26" fill="${area.tint}" opacity="0.07"/></g>`);
    parts.push(`<text class="area-label" x="${W / 2}" y="${bandTop + 40}" text-anchor="middle">${index + 1}. ${area.name.toUpperCase()}</text>`);
    parts.push(`<text class="area-sub" x="${W / 2}" y="${bandTop + 60}" text-anchor="middle">${area.blurb}</text>`);
  });

  // dotted trail through every node
  const pts = LEVELS.map((level) => nodePosition(level));
  let path = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    path += ` C${a.x},${a.y + ROW * 0.6} ${b.x},${b.y - ROW * 0.6} ${b.x},${b.y}`;
  }
  const clearedCount = LEVELS.filter((l) => save.stars[l.id]).length;
  parts.push(`<path class="route" d="${path}"/>`);
  if (clearedCount > 1) {
    let done = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < clearedCount; i++) {
      const a = pts[i - 1], b = pts[i];
      done += ` C${a.x},${a.y + ROW * 0.6} ${b.x},${b.y - ROW * 0.6} ${b.x},${b.y}`;
    }
    parts.push(`<path class="route done" d="${done}"/>`);
  }

  const nextId = Math.min(save.unlocked, LEVELS.length);
  LEVELS.forEach((level, i) => {
    const { x, y } = pts[i];
    const stars = save.stars[level.id] | 0;
    const unlocked = level.id <= save.unlocked;
    const cls = ['node', unlocked ? (stars ? 'done' : 'open') : 'locked'];
    if (level.id === nextId && !stars) cls.push('next');
    parts.push(`<g class="${cls.join(' ')}" data-id="${level.id}" transform="translate(${x},${y})" role="listitem" tabindex="${unlocked ? 0 : -1}" aria-label="Level ${level.id}, ${level.name}${unlocked ? '' : ' (locked)'}">`);
    if (level.id === nextId && !stars) parts.push('<circle class="pulse" r="24"/>');
    parts.push('<circle class="bubble" r="22"/>');
    parts.push(`<text class="num" y="7">${unlocked ? level.id : '🔒'}</text>`);
    for (let s = 0; s < 3; s++) {
      parts.push(`<circle class="pip${s < stars ? '' : ' off'}" cx="${(s - 1) * 11}" cy="${s === 1 ? 29 : 27}" r="4.2"/>`);
    }
    const art = level.goals.map((g) => GOAL_ART[g.type]).join('');
    const side = x > W / 2 ? -1 : 1;
    parts.push(`<text x="${side * 34}" y="-2" text-anchor="${side > 0 ? 'start' : 'end'}" class="area-sub">${level.name}</text>`);
    parts.push(`<text x="${side * 34}" y="15" text-anchor="${side > 0 ? 'start' : 'end'}" class="area-sub" font-size="13">${art}</text>`);
    parts.push('</g>');
  });
  parts.push('</svg>');
  holder.innerHTML = parts.join('');

  for (const node of holder.querySelectorAll('.node')) {
    const id = Number(node.dataset.id);
    if (id > save.unlocked) continue;
    node.addEventListener('click', () => onPick(id));
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(id); }
    });
  }
  return holder.querySelector('svg');
}

// Keeps the chosen level in view inside the scroller.
export function scrollToLevel(scroller, holder, id) {
  const svg = holder.querySelector('svg');
  if (!svg) return;
  const level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, id - 1))];
  const { y } = nodePosition(level);
  const scale = svg.clientWidth / W;
  scroller.scrollTop = Math.max(0, y * scale - scroller.clientHeight * 0.45);
}
