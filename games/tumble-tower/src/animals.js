// The animal blocks: collision shapes, look, and how each one is unlocked.
// Coordinates are metres, y up, before centring on the centroid.
import { polygonShape, boxShape, circleShape } from './physics.js';

function arc(r, from, to, n, cx = 0, cy = 0) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function ngon(n, r, rot = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}

// face: centre (fx, fy) and size fs in shape coordinates; `look` is the
// species-specific art drawn by sprites.js.
export const ANIMALS = [
  {
    id: 'hippo', name: 'Hippo', shape: () => boxShape(2.0, 1.3, 0.22), density: 1.1,
    color: '#a99be0', dark: '#6d5fae', belly: '#d9cff7', cheek: '#ff9fc4',
    face: { x: 0.45, y: 0.05, s: 0.95 }, look: 'hippo', blurb: 'Chunky and steady. The best base!', starter: true,
  },
  {
    id: 'giraffe', name: 'Giraffe', shape: () => boxShape(3.4, 0.62, 0.1), density: 0.9,
    color: '#ffc93c', dark: '#c7871b', belly: '#fff0b8', cheek: '#ff9f80',
    face: { x: 1.25, y: 0.02, s: 0.62 }, look: 'giraffe', blurb: 'Long and flat, or stand it tall for big height.', starter: true,
  },
  {
    id: 'panda', name: 'Panda', shape: () => circleShape(0.72), density: 1,
    color: '#fbfbfb', dark: '#3a3a48', belly: '#ffffff', cheek: '#ffb3c8',
    face: { x: 0, y: 0.04, s: 0.9 }, look: 'panda', blurb: 'Round and rolly. Find a cosy dip for it.', starter: true,
  },
  {
    id: 'turtle', name: 'Turtle', shape: () => polygonShape([[-1.2, -0.3], [1.2, -0.3], [0.8, 0.3], [-0.8, 0.3]]), density: 1,
    color: '#5cc96b', dark: '#2f8a45', belly: '#b9f0a8', cheek: '#ffb38a',
    face: { x: 0.0, y: -0.02, s: 0.62 }, look: 'turtle', blurb: 'Flat and wide: a handy shelf.', starter: true,
  },
  {
    id: 'penguin', name: 'Penguin', shape: () => boxShape(0.95, 1.6, 0.32), density: 1,
    color: '#38405c', dark: '#1d2236', belly: '#f6f7ff', cheek: '#ffa8b8',
    face: { x: 0, y: 0.35, s: 0.7 }, look: 'penguin', blurb: 'Tall and narrow. Wobbles politely.', unlock: { island: 0 },
  },
  {
    id: 'frog', name: 'Frog', shape: () => polygonShape([[-1.0, -0.55], [1.0, -0.55], [0, 0.75]]), density: 1,
    color: '#8be04e', dark: '#4c9a22', belly: '#e1ffb8', cheek: '#ff9fa0',
    face: { x: 0, y: -0.12, s: 0.7 }, look: 'frog', blurb: 'Pointy on top. Flip it for a funnel!', unlock: { island: 0 },
  },
  {
    id: 'owl', name: 'Owl', shape: () => polygonShape(ngon(6, 0.78, 0)), density: 0.9,
    color: '#c58b5a', dark: '#7f5232', belly: '#f3d7b5', cheek: '#ffaf8f',
    face: { x: 0, y: 0.08, s: 0.85 }, look: 'owl', blurb: 'Six sides: sits flat, rocks a little.', unlock: { island: 1 },
  },
  {
    id: 'pig', name: 'Pig', shape: () => polygonShape(ngon(5, 0.82, Math.PI / 2)), density: 1,
    color: '#ffa9c6', dark: '#d9668f', belly: '#ffd6e4', cheek: '#ff7aa5',
    face: { x: 0, y: -0.05, s: 0.85 }, look: 'pig', blurb: 'A pointy roof of a pig. Sits on its flat side.', unlock: { island: 1 },
  },
  {
    id: 'elephant', name: 'Elephant', shape: () => boxShape(1.9, 1.75, 0.3), density: 1.3,
    color: '#9fb4c8', dark: '#5f7690', belly: '#d6e2ee', cheek: '#ffb0c0',
    face: { x: 0.3, y: 0.15, s: 1.05 }, look: 'elephant', blurb: 'Big, heavy and dependable.', unlock: { island: 2 },
  },
  {
    id: 'hedgehog', name: 'Hedgehog', shape: () => polygonShape(arc(0.85, 0, Math.PI, 8)), density: 1,
    color: '#b88a63', dark: '#6e4b2e', belly: '#f2d9bd', cheek: '#ff9f9f',
    face: { x: 0.25, y: 0.28, s: 0.6 }, look: 'hedgehog', blurb: 'A dome: lovely on the bottom, tricky on top.', unlock: { island: 2 },
  },
  {
    id: 'croc', name: 'Crocodile', shape: () => polygonShape([[-1.5, -0.33], [1.3, -0.33], [1.5, 0.33], [-1.3, 0.33]]), density: 1,
    color: '#3fb38a', dark: '#1f7458', belly: '#c8f2d8', cheek: '#ffad8c',
    face: { x: 1.0, y: 0.05, s: 0.6 }, look: 'croc', blurb: 'Extra long and a bit slanty.', unlock: { island: 3 },
  },
  {
    id: 'chick', name: 'Chick', shape: () => circleShape(0.45), density: 0.8,
    color: '#ffe45c', dark: '#d1a514', belly: '#fff7c2', cheek: '#ffa07a',
    face: { x: 0, y: 0.04, s: 0.55 }, look: 'chick', blurb: 'Tiny and round. Tuck it in a gap.', unlock: { island: 3 },
  },
];

export const ANIMAL_BY_ID = Object.fromEntries(ANIMALS.map((a) => [a.id, a]));
export const STARTERS = ANIMALS.filter((a) => a.starter).map((a) => a.id);

const shapeCache = new Map();
// Shapes are immutable, so one instance per animal is shared by all bodies.
export function animalShape(id) {
  if (!shapeCache.has(id)) shapeCache.set(id, ANIMAL_BY_ID[id].shape());
  return shapeCache.get(id);
}

// Height of the animal's bounding box at a given angle.
export function heightAt(id, angle) {
  const s = animalShape(id);
  if (s.type === 'circle') return 2 * s.r;
  const c = Math.cos(angle), sn = Math.sin(angle);
  let lo = Infinity, hi = -Infinity;
  for (const v of s.verts) {
    const y = sn * v.x + c * v.y;
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  return hi - lo;
}

// How far the animal reaches below its centre at a given angle.
export function extentBelow(id, angle) {
  const s = animalShape(id);
  if (s.type === 'circle') return s.r;
  const c = Math.cos(angle), sn = Math.sin(angle);
  let lo = 0;
  for (const v of s.verts) lo = Math.min(lo, sn * v.x + c * v.y);
  return -lo;
}

export function widthAt(id, angle) {
  const s = animalShape(id);
  if (s.type === 'circle') return 2 * s.r;
  const c = Math.cos(angle), sn = Math.sin(angle);
  let lo = Infinity, hi = -Infinity;
  for (const v of s.verts) {
    const x = c * v.x - sn * v.y;
    lo = Math.min(lo, x); hi = Math.max(hi, x);
  }
  return hi - lo;
}

// The flattest resting height (used for level validation).
export function flatHeight(id) {
  let best = Infinity;
  for (let k = 0; k < 8; k++) best = Math.min(best, heightAt(id, (k * Math.PI) / 4));
  return best;
}

export const ICE_FRICTION = 0.1;
export const FRICTION = 0.75;
