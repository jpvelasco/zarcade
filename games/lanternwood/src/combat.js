// Combat math: damage, armor, knockback, invulnerability and hearts.
// Health is counted in half hearts, so 3 hearts = 6 hp.

export const PLAYER_IFRAMES = 1.0;   // seconds of blinking after a hit
export const ENEMY_IFRAMES = 0.28;
export const HITSTOP = { hit: 0.055, heavy: 0.11, hurt: 0.09 };
export const KNOCKBACK = { enemy: 190, player: 150, heavy: 240 };
export const KNOCKBACK_TIME = 0.16;

export const DAMAGE = { sword: 2, dash: 4, ember: 2, boomerang: 0, vine: 0 };

/** Unit vector from (fx, fy) toward (tx, ty); straight down when they overlap. */
export function towards(fx, fy, tx, ty) {
  const dx = tx - fx, dy = ty - fy;
  const len = Math.hypot(dx, dy);
  return len < 1e-6 ? { x: 0, y: 1 } : { x: dx / len, y: dy / len };
}

/**
 * True when an armored front blocks a hit: the attacker stands in front of
 * the way the target faces (within about 60 degrees).
 */
export function armorBlocks(target, attackerX, attackerY) {
  if (!target.armored || target.stun > 0) return false;
  const d = towards(target.x, target.y, attackerX, attackerY);
  return d.x * target.face.x + d.y * target.face.y > 0.5;
}

/**
 * Apply a hit to an enemy or the player. Mutates `target` (hp, iframes,
 * knockback) and returns what happened: 'immune' | 'blocked' | 'hit' | 'defeated'.
 */
export function applyHit(target, amount, fromX, fromY, { iframes = ENEMY_IFRAMES, kb = KNOCKBACK.enemy, pierce = false } = {}) {
  if (target.iframes > 0 || target.hp <= 0) return 'immune';
  if (!pierce && armorBlocks(target, fromX, fromY)) {
    target.iframes = 0.15;
    return 'blocked';
  }
  const dir = towards(fromX, fromY, target.x, target.y);
  target.hp = Math.max(0, target.hp - amount);
  target.iframes = iframes;
  const k = target.heavy ? kb * 0.35 : kb;
  target.kb = { x: dir.x * k, y: dir.y * k, t: KNOCKBACK_TIME };
  return target.hp <= 0 ? 'defeated' : 'hit';
}

/** Knockback velocity this frame, decaying linearly to zero. */
export function knockbackStep(kb, dt) {
  if (!kb || kb.t <= 0) return { x: 0, y: 0 };
  const f = Math.max(0, kb.t / KNOCKBACK_TIME);
  kb.t -= dt;
  return { x: kb.x * f, y: kb.y * f };
}

/**
 * Hurt the player. A Fairy Tea in the bag saves Wren once at zero hearts.
 * Returns 'immune' | 'hurt' | 'saved' | 'down'.
 */
export function hurtPlayer(player, save, amount, fromX, fromY) {
  const res = applyHit(player, amount, fromX, fromY, { iframes: PLAYER_IFRAMES, kb: KNOCKBACK.player, pierce: true });
  if (res === 'immune') return res;
  save.hearts = player.hp;
  if (player.hp > 0) return 'hurt';
  if (save.tea > 0) {
    save.tea -= 1;
    player.hp = save.hearts = save.maxHearts * 2;
    return 'saved';
  }
  return 'down';
}

/** Heart icons for the HUD: an array of 'full' | 'half' | 'empty'. */
export function heartIcons(hp, maxHearts) {
  const out = [];
  for (let i = 0; i < maxHearts; i++) {
    const v = hp - i * 2;
    out.push(v >= 2 ? 'full' : v === 1 ? 'half' : 'empty');
  }
  return out;
}

/** Heal by half hearts, capped at the number of containers. */
export function heal(save, halves) {
  save.hearts = Math.min(save.maxHearts * 2, save.hearts + halves);
  return save.hearts;
}
