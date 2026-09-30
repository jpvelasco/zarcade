// Pure combat and economy rules shared by the simulation, UI and tests.
import { DEFENDERS, MIN_DAMAGE_FRACTION, SELL_REFUND, SLIME_BOOST } from './data.js';

// Armor subtracts a flat amount from each hit, but never more than 80%.
// Magic ignores armor entirely.
export function damageAfterArmor(damage, armor, magic = false) {
  if (magic || armor <= 0) return damage;
  return Math.max(damage * MIN_DAMAGE_FRACTION, damage - armor);
}

// Bug speed from its base speed, the strongest slow on it, and slime.
// Bosses resist part of any slow.
export function effectiveSpeed(base, slow = 0, slimed = false, slowResist = 0) {
  const s = Math.min(0.9, Math.max(0, slow)) * (1 - slowResist);
  return base * (1 - s) * (slimed ? 1 + SLIME_BOOST : 1);
}

export function canTarget(def, bug) {
  return bug.flying ? def.air : def.ground;
}

// Pick a target among bugs in range. `bugs` need x, y, hp, remaining, flying.
//   first:     closest to the picnic (least route left)
//   strongest: most health left
//   closest:   nearest to the defender
export function pickTarget(pos, range, bugs, mode, filter = () => true) {
  let best = null, bestScore = Infinity;
  const r2 = range * range;
  for (const b of bugs) {
    if (b.hp <= 0 || !filter(b)) continue;
    const dx = b.x - pos.x, dy = b.y - pos.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    let score;
    if (mode === 'strongest') score = -b.hp * 1000 + b.remaining;
    else if (mode === 'closest') score = d2 * 1000 + b.remaining;
    else score = b.remaining;
    if (score < bestScore) { bestScore = score; best = b; }
  }
  return best;
}

export function tierStats(type, tier) {
  return DEFENDERS[type].tiers[tier];
}

export function buildCost(type) {
  return DEFENDERS[type].tiers[0].cost;
}

// Cost of the next tier, or null when maxed.
export function upgradeCost(type, tier) {
  const next = DEFENDERS[type].tiers[tier + 1];
  return next ? next.cost : null;
}

export function investedIn(type, tier) {
  let sum = 0;
  for (let i = 0; i <= tier; i++) sum += DEFENDERS[type].tiers[i].cost;
  return sum;
}

// Selling returns 70% of everything spent, or all of it if the defender was
// planted during the current build break and has not fired yet.
export function sellValue(invested, fresh = false) {
  return fresh ? invested : Math.floor(invested * SELL_REFUND);
}

// Strongest lavender aura covering a defender (auras do not stack).
export function auraFor(def, defenders) {
  let best = { dmg: 0, range: 0, rate: 0 };
  for (const o of defenders) {
    if (o === def || o.type !== 'lavender') continue;
    const t = DEFENDERS.lavender.tiers[o.tier];
    if (Math.hypot(o.x - def.x, o.y - def.y) > t.aura) continue;
    if (t.dmgBuff > best.dmg || (t.dmgBuff === best.dmg && t.rangeBuff > best.range)) {
      best = { dmg: t.dmgBuff, range: t.rangeBuff, rate: t.rateBuff };
    }
  }
  return best;
}

// Stars from picnic baskets left at the end of a won map.
export function starsFor(baskets, max) {
  if (baskets <= 0) return 0;
  if (baskets >= max - 1) return 3;
  if (baskets >= Math.ceil(max / 2)) return 2;
  return 1;
}
