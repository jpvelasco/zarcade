// The seaside map: a winding trail of levels through five areas, drawn as
// one SVG. Tapping an unlocked level starts it.
import { LEVELS, AREAS } from './levels.js';
import { THEMES } from './render.js';

const W = 360;
const ROW = 66;
const HEAD = 110;

export function nodePosition(level) {
  const area = AREAS[level.area];
  const within = level.id - area.from;
  const bandTop = level.area * (HEAD + (area.to - area.from + 1) * ROW);
  return {
    x: W / 2 + Math.sin(within * 0.85 + level.area * 1.7) * 112,
    y: bandTop + HEAD + within * ROW,
    bandTop,
    bandHeight: HEAD + (area.to - area.from + 1) * ROW,
  };
}

export function mapHeight() {
  return AREAS.reduce((y, a) => y + HEAD + (a.to - a.from + 1) * ROW, 0) + 24;
}

function deco(area, top, height) {
  const out = [];
  const y = (f) => (top + height * f).toFixed(1);
  switch (area) {
    case 0:
      out.push(`<path d="M18 ${y(0.35)} l6 14 15 1 -12 9 5 15 -14 -9 -14 9 5 -15 -12 -9 15 -1z" fill="#ff8a5c" opacity="0.85"/>`);
      out.push(`<ellipse cx="330" cy="${y(0.6)}" rx="22" ry="12" fill="#6b6f7a"/><ellipse cx="330" cy="${y(0.59)}" rx="13" ry="5" fill="#5fd9e6"/>`);
      out.push(`<ellipse cx="34" cy="${y(0.82)}" rx="18" ry="9" fill="#6b6f7a"/>`);
      break;
    case 1:
      for (const x of [14, 336]) out.push(`<rect x="${x}" y="${top + 30}" width="10" height="${height - 60}" rx="3" fill="#7a4d2e" opacity="0.7"/>`);
      out.push(`<path d="M300 ${y(0.3)} q8 -8 16 0 q8 -8 16 0" stroke="#3a2a2a" stroke-width="3" fill="none" stroke-linecap="round"/>`);
      break;
    case 2:
      out.push(`<g transform="translate(320 ${y(0.45)})"><path d="M-12 40 L-8 -20 L8 -20 L12 40z" fill="#f4f0ea"/><rect x="-11" y="-2" width="22" height="8" fill="#e0524f"/><rect x="-10" y="18" width="20" height="8" fill="#e0524f"/><rect x="-7" y="-30" width="14" height="10" fill="#ffe680"/><path d="M-10 -30 L0 -40 L10 -30z" fill="#3c3150"/></g>`);
      break;
    case 3:
      for (const [x, f, c] of [[22, 0.4, '#ff7aa8'], [338, 0.62, '#ffb35c'], [28, 0.85, '#b28cff']]) {
        out.push(`<path d="M${x} ${y(f)} v-26 m0 10 l-10 -12 m10 6 l10 -14" stroke="${c}" stroke-width="5" stroke-linecap="round" fill="none"/>`);
      }
      break;
    case 4:
      out.push(`<path d="M300 ${y(0.75)} q30 -30 56 -10 v40 h-56z" fill="#2a1d16" opacity="0.8"/><circle cx="322" cy="${y(0.78)}" r="6" fill="#ffcf5a" opacity="0.4"/>`);
      out.push(`<rect x="16" y="${y(0.4)}" width="28" height="18" rx="4" fill="#8a5a2a"/><rect x="16" y="${y(0.4)}" width="28" height="7" rx="3" fill="#b07a3a"/><circle cx="30" cy="${(top + height * 0.4 + 10).toFixed(1)}" r="3" fill="#ffcf5a"/>`);
      break;
    default:
  }
  return out.join('');
}

export function renderMap(holder, save, onPick) {
  const height = mapHeight();
  const parts = [];
  parts.push(`<svg viewBox="0 0 ${W} ${height}" xmlns="http://www.w3.org/2000/svg" aria-label="Seaside map">`);
  parts.push('<defs>');
  AREAS.forEach((area, i) => {
    const t = THEMES[i];
    parts.push(`<linearGradient id="band${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.sky[0]}"/><stop offset="0.6" stop-color="${t.sky[1]}"/><stop offset="1" stop-color="${t.sky[2]}"/></linearGradient>`);
  });
  parts.push(`<radialGradient id="node-open" cx="38%" cy="32%"><stop offset="0%" stop-color="#ffffff"/><stop offset="45%" stop-color="#9fe6ff"/><stop offset="100%" stop-color="#2f8fd0"/></radialGradient>`);
  parts.push(`<radialGradient id="node-done" cx="38%" cy="32%"><stop offset="0%" stop-color="#ffffff"/><stop offset="45%" stop-color="#ffe9a0"/><stop offset="100%" stop-color="#f0a020"/></radialGradient>`);
  parts.push('</defs>');

  AREAS.forEach((area, index) => {
    const { bandTop, bandHeight } = nodePosition(LEVELS[area.from - 1]);
    parts.push(`<rect x="0" y="${bandTop}" width="${W}" height="${bandHeight}" fill="url(#band${index})"/>`);
    parts.push(deco(index, bandTop, bandHeight));
    const done = LEVELS.filter((l) => l.area === index && save.stars[l.id]).length;
    parts.push(`<g class="area-head"><rect x="40" y="${bandTop + 18}" width="${W - 80}" height="58" rx="18" fill="rgba(255,255,255,0.88)"/>`);
    parts.push(`<text class="area-label" x="${W / 2}" y="${bandTop + 44}" text-anchor="middle" fill="${THEMES[index].frameDark}">${index + 1}. ${area.name}</text>`);
    parts.push(`<text class="area-sub" x="${W / 2}" y="${bandTop + 64}" text-anchor="middle">${area.blurb} · ${done}/${area.to - area.from + 1}</text></g>`);
  });

  const pts = LEVELS.map((level) => nodePosition(level));
  const trail = (count) => {
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y}`;
    for (let i = 1; i < count; i++) {
      const a = pts[i - 1], b = pts[i];
      d += ` C${a.x.toFixed(1)},${a.y + ROW * 0.6} ${b.x.toFixed(1)},${b.y - ROW * 0.6} ${b.x.toFixed(1)},${b.y}`;
    }
    return d;
  };
  parts.push(`<path class="route" d="${trail(pts.length)}"/>`);
  const reached = Math.min(save.unlocked, LEVELS.length);
  if (reached > 1) parts.push(`<path class="route done" d="${trail(reached)}"/>`);

  LEVELS.forEach((level, i) => {
    const { x, y } = pts[i];
    const stars = save.stars[level.id] | 0;
    const open = level.id <= save.unlocked;
    const current = level.id === reached;
    const cls = ['node', open ? 'open' : 'locked', stars ? 'done' : '', current ? 'current' : ''].join(' ');
    parts.push(`<g class="${cls}" data-level="${level.id}" transform="translate(${x.toFixed(1)} ${y})" role="button" tabindex="${open ? 0 : -1}" aria-label="Level ${level.id}, ${level.name}${open ? '' : ', locked'}${stars ? `, ${stars} stars` : ''}">`);
    if (current) parts.push('<circle class="pulse" r="27"/>');
    parts.push(`<circle class="disc" r="22" fill="${!open ? '#8c9aa8' : stars ? 'url(#node-done)' : 'url(#node-open)'}"/>`);
    parts.push('<ellipse cx="-7" cy="-9" rx="7" ry="4" fill="#fff" opacity="0.7" transform="rotate(-30 -7 -9)"/>');
    parts.push(`<text class="num" y="7" text-anchor="middle">${open ? level.id : '🔒'}</text>`);
    if (open) {
      const icon = level.goal.type === 'otters' ? 'O' : level.goal.type === 'anchor' ? 'A' : '';
      if (icon === 'O') parts.push('<g transform="translate(18 -17)"><circle r="9" fill="#a8713f" stroke="#fff" stroke-width="2"/><circle cx="-3.2" cy="-1.5" r="1.5" fill="#2a1a10"/><circle cx="3.2" cy="-1.5" r="1.5" fill="#2a1a10"/><ellipse cy="2.4" rx="3.6" ry="2.6" fill="#f0cfa0"/><ellipse cy="1.6" rx="1.7" ry="1.2" fill="#2a1a10"/></g>');
      else if (icon === 'A') parts.push('<g transform="translate(18 -17)"><circle r="9" fill="#ffcf5a" stroke="#fff" stroke-width="2"/><path d="M0 -5 v10 M-3.5 -2 h7 M-5 1.5 q0 4 5 4 q5 0 5 -4" stroke="#3b2a1a" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>');
      for (let k = 0; k < 3; k++) {
        parts.push(`<text class="star ${k < stars ? 'on' : ''}" x="${(k - 1) * 15}" y="40" text-anchor="middle">★</text>`);
      }
    }
    parts.push('</g>');
  });
  parts.push('</svg>');
  holder.innerHTML = parts.join('');
  for (const node of holder.querySelectorAll('.node.open')) {
    const pick = () => onPick(Number(node.dataset.level));
    node.addEventListener('click', pick);
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  }
}

export function scrollToLevel(scroller, holder, id) {
  const svg = holder.querySelector('svg');
  if (!svg) return;
  const level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, id - 1))];
  const scale = svg.getBoundingClientRect().width / W;
  const { y } = nodePosition(level);
  scroller.scrollTop = Math.max(0, y * scale - scroller.clientHeight * 0.45);
}
