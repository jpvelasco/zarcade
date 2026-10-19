// Guns. `fire` turns a trigger pull into plain bullet objects; the world
// moves them and checks hits. Pure, so tests can count pellets and angles.

export const WEAPONS = Object.freeze({
  normal: { label: 'Blaster', letter: '', cooldown: 0.16, speed: 270, damage: 1, life: 0.95, size: 3, max: 6 },
  spread: { label: 'Spread', letter: 'S', cooldown: 0.28, speed: 240, damage: 1, life: 0.75, size: 3, max: 20, fan: [-0.28, -0.14, 0, 0.14, 0.28] },
  laser: { label: 'Laser', letter: 'L', cooldown: 0.36, speed: 430, damage: 3, life: 0.6, size: 3, max: 3, pierce: true, length: 26 },
  rapid: { label: 'Rapid', letter: 'R', cooldown: 0.085, speed: 340, damage: 1, life: 0.7, size: 2, max: 10 },
  flame: { label: 'Flame', letter: 'F', cooldown: 0.07, speed: 200, damage: 0.8, life: 0.46, size: 5, max: 14, pierce: true, grow: 14 },
});

export const WEAPON_IDS = Object.keys(WEAPONS);
export const BOMB_MAX = 3;

/** Normalised 8-way aim. */
export function aimVector(ax, ay) {
  if (ax === 0 && ay === 0) return { x: 1, y: 0 };
  const len = Math.hypot(ax, ay);
  return { x: ax / len, y: ay / len };
}

/** Where shots leave the runner's gun for a given aim. */
export function muzzle(p, aim) {
  const cx = p.x + p.w / 2;
  if (p.duck) return { x: cx + aim.x * 9, y: p.y + p.h - 5 };
  const cy = p.y + 8;
  return { x: cx + aim.x * 8, y: cy + aim.y * 9 };
}

/**
 * Pull the trigger. Returns the new bullets (possibly none, when the gun is
 * cooling down or too many shots are already flying).
 */
export function fire(gun, p, aimX, aimY, live = 0) {
  const spec = WEAPONS[gun.id] || WEAPONS.normal;
  if (gun.cooldown > 0 || live >= spec.max) return [];
  gun.cooldown = spec.cooldown;
  const aim = aimVector(aimX, aimY);
  const from = muzzle(p, aim);
  const base = Math.atan2(aim.y, aim.x);
  const angles = spec.fan || [0];
  const shots = [];
  for (const offset of angles) {
    const angle = base + offset;
    const vx = Math.cos(angle) * spec.speed;
    const vy = Math.sin(angle) * spec.speed;
    shots.push({
      kind: gun.id,
      owner: p.id,
      x: from.x,
      y: from.y,
      vx: vx + (gun.id === 'flame' ? p.vx * 0.5 : 0),
      vy,
      angle,
      size: spec.size,
      damage: spec.damage,
      life: spec.life,
      age: 0,
      pierce: !!spec.pierce,
      hits: spec.pierce ? [] : null,
      dead: false,
    });
  }
  return shots;
}

export function coolGun(gun, dt) {
  gun.cooldown = Math.max(0, gun.cooldown - dt);
}

/** The square a bullet hits with this frame (flames grow as they fly). */
export function bulletBox(b) {
  let size = b.size;
  if (b.kind === 'flame') size += (WEAPONS.flame.grow * b.age) / WEAPONS.flame.life;
  if (b.kind === 'laser') {
    const len = WEAPONS.laser.length;
    const hx = Math.abs(Math.cos(b.angle)) * len / 2 + 2;
    const hy = Math.abs(Math.sin(b.angle)) * len / 2 + 2;
    return { x: b.x - hx, y: b.y - hy, w: hx * 2, h: hy * 2 };
  }
  return { x: b.x - size / 2, y: b.y - size / 2, w: size, h: size };
}

export function moveBullet(b, dt) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.age += dt;
  if (b.kind === 'flame') {
    b.vx *= 1 - 1.8 * dt;
    b.vy = b.vy * (1 - 1.8 * dt) - 40 * dt;
  }
  if (b.age >= b.life) b.dead = true;
}

/** Can this bullet hurt target `id`? Piercing shots hit each target once. */
export function canHit(b, id) {
  if (b.dead) return false;
  return !b.hits || !b.hits.includes(id);
}

export function markHit(b, id) {
  if (b.hits) b.hits.push(id);
  else b.dead = true;
}
