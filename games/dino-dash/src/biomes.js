// The valley's four looks, cycling with distance, and smooth blends between
// them. Pure data and colour maths.
import { BIOME_LEN, BIOME_BLEND } from './config.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const RAW = [
  {
    id: 'fern', name: 'Fern Valley', night: false,
    skyTop: '#3fa4f5', skyBottom: '#c6efff', fog: '#d9f3ff', sun: '#fff6c8',
    grassA: '#6bcd4c', grassB: '#5fbf43', roadA: '#e6bd7d', roadB: '#dcb171', edge: '#a37b52', line: '#f8e4b8',
    far: '#9cc9ec', near: '#5fa457', props: ['fern', 'cycad', 'rock', 'mushroom', 'nest', 'fern', 'tree', 'cycad'],
  },
  {
    id: 'mesa', name: 'Sunset Mesa', night: false,
    skyTop: '#ff6f61', skyBottom: '#ffd58c', fog: '#ffd29e', sun: '#fff1b0',
    grassA: '#e3a352', grassB: '#d69646', roadA: '#f2cb92', roadB: '#e7bd82', edge: '#b4683a', line: '#fff2cc',
    far: '#ea8f7e', near: '#b9573f', props: ['mesa', 'bones', 'cycad', 'rock', 'cactus', 'mesa', 'bones', 'tree'],
  },
  {
    id: 'marsh', name: 'Misty Marsh', night: false,
    skyTop: '#58b4ad', skyBottom: '#cdeee2', fog: '#d6f0e7', sun: '#f4ffe9',
    grassA: '#4dad8a', grassB: '#44a07e', roadA: '#cdb88c', roadB: '#c1aa7d', edge: '#6b8868', line: '#ecf5da',
    far: '#93c8bf', near: '#468a77', props: ['reeds', 'lily', 'fern', 'reeds', 'mushroom', 'tree', 'rock', 'lily'],
  },
  {
    id: 'grove', name: 'Starry Grove', night: true,
    skyTop: '#16124a', skyBottom: '#5b3d9c', fog: '#4c3b88', sun: '#f3f0ff',
    grassA: '#2e6a5a', grassB: '#296052', roadA: '#917dab', roadB: '#8773a1', edge: '#5a4a7b', line: '#dccbff',
    far: '#3a2f7a', near: '#29295c', props: ['glow', 'crystal', 'glow', 'fern', 'crystal', 'tree', 'glow', 'rock'],
  },
];

const COLOR_KEYS = ['skyTop', 'skyBottom', 'fog', 'sun', 'grassA', 'grassB', 'roadA', 'roadB', 'edge', 'line', 'far', 'near'];

export const BIOMES = RAW.map((b) => {
  const rgb = {};
  for (const k of COLOR_KEYS) rgb[k] = hex(b[k]);
  return { ...b, rgb };
});

// Where in the cycle a distance falls: the biome, the next one, and the
// blend (0 = all `from`, 1 = all `to`).
export function biomeAt(distance) {
  const d = Math.max(0, distance);
  const i = Math.floor(d / BIOME_LEN);
  const into = d - i * BIOME_LEN;
  const from = i % BIOMES.length;
  const to = (i + 1) % BIOMES.length;
  const t = into > BIOME_LEN - BIOME_BLEND ? (into - (BIOME_LEN - BIOME_BLEND)) / BIOME_BLEND : 0;
  return { index: i, from, to, t };
}

// A blended palette of CSS colour strings, quantised to 24 steps and cached
// so the renderer never builds colour strings per frame.
const cache = new Map();
export const BLEND_STEPS = 24;
export function palette(from, to, t) {
  const q = Math.round(Math.max(0, Math.min(1, t)) * BLEND_STEPS);
  const key = from * 1000 + to * 100 + q;
  let p = cache.get(key);
  if (p) return p;
  const a = BIOMES[from].rgb;
  const b = BIOMES[to].rgb;
  const u = q / BLEND_STEPS;
  p = { key, from, to, u, night: u < 0.5 ? BIOMES[from].night : BIOMES[to].night, nightness: (BIOMES[from].night ? 1 - u : 0) + (BIOMES[to].night ? u : 0) };
  for (const k of COLOR_KEYS) {
    const c = a[k].map((v, i) => Math.round(v + (b[k][i] - v) * u));
    p[k] = `rgb(${c[0]},${c[1]},${c[2]})`;
    p[k + 'Rgb'] = c;
  }
  cache.set(key, p);
  return p;
}
