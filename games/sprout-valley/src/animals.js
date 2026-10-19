// Farm animals: buying, feeding from the trough, petting and daily produce.
// DOM-free.
import { ANIMALS, HEART_POINTS, MAX_HEARTS } from './data.js';
import { PEN_ROAM } from './map.js';

export const TROUGH_CAPACITY = 20;
export const PET_POINTS = 25;
const NAMES = {
  chicken: ['Nugget', 'Pecky', 'Sunny', 'Clover'],
  cow: ['Daisy', 'Buttercup'],
  goat: ['Biscuit'],
};

export function makeAnimal(type, n, rand) {
  const names = NAMES[type];
  return {
    type, name: names[n % names.length], points: 0, ate: false, petted: false,
    x: PEN_ROAM.x0 + 1 + rand() * (PEN_ROAM.x1 - PEN_ROAM.x0 - 2),
    y: PEN_ROAM.y0 + 1 + rand() * (PEN_ROAM.y1 - PEN_ROAM.y0 - 2),
    tx: null, ty: null, wait: rand() * 3, dir: 1, bob: 0,
  };
}

export const animalHearts = (a) => Math.min(MAX_HEARTS, Math.floor(a.points / HEART_POINTS));

// Petting once a day makes an animal happier.
export function pet(a) {
  if (a.petted) return false;
  a.petted = true;
  a.points = Math.min(MAX_HEARTS * HEART_POINTS, a.points + PET_POINTS);
  return true;
}

// Night: each animal eats one hay from the trough if there is any.
// Returns the hay left.
export function feedNight(animals, trough) {
  for (const a of animals) {
    a.ate = trough > 0;
    if (a.ate) trough--;
  }
  return trough;
}

// Morning: every animal that ate makes produce (happy ones sometimes two).
// Returns [{ animal, item, n }].
export function morningProduce(animals, rand) {
  const out = [];
  for (const a of animals) {
    if (a.ate) {
      const bonus = animalHearts(a) >= 4 && rand() < 0.3 ? 1 : 0;
      out.push({ animal: a, item: ANIMALS[a.type].produce, n: 1 + bonus });
    }
    a.ate = false;
    a.petted = false;
  }
  return out;
}

// Ambling around the pen. `blocked(x, y)` is the world's collision test.
export function wander(a, dt, rand, blocked) {
  a.bob += dt;
  if (a.tx === null) {
    a.wait -= dt;
    if (a.wait <= 0) {
      a.tx = PEN_ROAM.x0 + 0.5 + rand() * (PEN_ROAM.x1 - PEN_ROAM.x0);
      a.ty = PEN_ROAM.y0 + 0.5 + rand() * (PEN_ROAM.y1 - PEN_ROAM.y0);
    }
    return;
  }
  const speed = a.type === 'chicken' ? 1.4 : 0.8;
  const dx = a.tx - a.x, dy = a.ty - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.1) { a.tx = null; a.wait = 1.5 + rand() * 4; return; }
  const nx = a.x + (dx / d) * speed * dt, ny = a.y + (dy / d) * speed * dt;
  // An animal already overlapping something (a decoration put down on it, or
  // a new one dropped on one) may walk until it is clear, instead of freezing.
  if (blocked(nx, ny) && !blocked(a.x, a.y)) { a.tx = null; a.wait = 0.5 + rand(); return; }
  if (Math.abs(dx) > 0.05) a.dir = dx > 0 ? 1 : -1;
  a.x = nx; a.y = ny;
}
