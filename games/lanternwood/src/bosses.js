// The three dungeon bosses. Each one cycles through a few attacks, and every
// attack shows a warning first (a shadow where it will land, a line where the
// claw will fly, a ring where the bell will boom). Each boss also asks for the
// item found in its dungeon or the lantern.
import { TILE } from './tiles.js';
import { towards } from './combat.js';

/** Items each boss needs; the solver checks these. */
export const BOSS_NEEDS = { toad: ['sword'], bellcrab: ['sword', 'grapple'], shade: ['sword', 'lantern'] };

// `dmg` is what touching a boss costs (half a heart); its attacks hit harder.
export const BOSS_TYPES = {
  toad: { name: 'Grumbletoad', hp: 20, dmg: 1, hw: 14, hh: 11, daze: 1.2 },
  bellcrab: { name: 'Old Bellcrab', hp: 20, dmg: 1, hw: 15, hh: 11, armored: true, vineStun: 2.4 },
  shade: { name: 'The Shade King', hp: 18, dmg: 1, hw: 10, hh: 12, fly: true },
};

export function makeBoss(kind, x, y) {
  const t = BOSS_TYPES[kind];
  return {
    kind, boss: true, x, y, hw: t.hw, hh: t.hh, hp: t.hp, maxHp: t.hp, dmg: t.dmg,
    armored: !!t.armored, heavy: true, fly: !!t.fly, face: { x: 0, y: 1 },
    iframes: 0, kb: null, stun: 0, t: 1.4, state: 'intro', vx: 0, vy: 0, anim: 0,
    tele: null, z: 0, alive: true, cycle: 0, home: { x, y }, revealed: kind !== 'shade',
  };
}

/** Can this boss be hurt right now? (Mid-air toads and hidden shades can't.) */
export function bossVulnerable(b) {
  if (b.kind === 'toad') return b.z < 3;
  if (b.kind === 'shade') return b.revealed;
  return true;
}

export function updateBoss(b, g, dt) {
  b.anim += dt;
  if (b.iframes > 0) b.iframes -= dt;
  if (b.stun > 0) { b.stun -= dt; b.tele = null; b.z = 0; return; }
  b.t -= dt;
  if (b.state === 'intro') {
    if (b.t <= 0) { b.state = 'rest'; b.t = 0.6; }
    return;
  }
  BOSS_UPDATE[b.kind](b, g, dt);
}

const BOSS_UPDATE = {
  toad(b, g, dt) {
    const p = g.player;
    switch (b.state) {
      case 'rest':
        if (b.t <= 0) {
          b.cycle++;
          if (b.cycle % 3 === 0) { b.state = 'puff'; b.t = 0.75; b.tele = { kind: 'puff' }; }
          else {
            b.state = 'crouch'; b.t = 0.85;
            b.target = { x: p.x, y: p.y };
            b.tele = { kind: 'shadow', x: p.x, y: p.y, r: 20 };
            b.from = { x: b.x, y: b.y };
          }
        }
        break;
      case 'crouch':
        if (b.t <= 0) { b.state = 'air'; b.t = 0.7; g.emit({ type: 'boing', x: b.x, y: b.y }); }
        break;
      case 'air': {
        const k = 1 - Math.max(0, b.t) / 0.7;
        const nx = b.from.x + (b.target.x - b.from.x) * k;
        const ny = b.from.y + (b.target.y - b.from.y) * k;
        g.moveEnemy(b, nx - b.x, ny - b.y, true);
        b.z = Math.sin(k * Math.PI) * 40;
        if (b.t <= 0) {
          b.z = 0; b.tele = null;
          b.state = 'dazed'; b.t = BOSS_TYPES.toad.daze;
          g.spawnHostile({ kind: 'ring', x: b.x, y: b.y + 4, r: 8, maxR: 36, grow: 90, band: 8, dmg: 1 });
          g.shake(6);
          g.emit({ type: 'thud', x: b.x, y: b.y, big: true });
        }
        break;
      }
      case 'dazed':
        if (b.t <= 0) { b.state = 'rest'; b.t = 0.5; }
        break;
      case 'puff':
        if (b.t <= 0) {
          b.tele = null;
          const d = towards(b.x, b.y, p.x, p.y);
          const a = Math.atan2(d.y, d.x);
          for (const off of [-0.4, 0, 0.4]) {
            g.spawnHostile({ kind: 'seed', x: b.x, y: b.y, vx: Math.cos(a + off) * 95, vy: Math.sin(a + off) * 95, r: 4, dmg: 1, life: 3 });
          }
          g.emit({ type: 'spit', x: b.x, y: b.y });
          b.state = 'rest'; b.t = 1.1;
        }
        break;
      default:
        b.state = 'rest';
    }
  },

  bellcrab(b, g, dt) {
    const p = g.player;
    switch (b.state) {
      case 'rest':
      case 'scuttle': {
        b.state = 'scuttle';
        const dx = p.x - b.x;
        g.moveEnemy(b, Math.sign(dx) * Math.min(Math.abs(dx), 46 * dt), (b.home.y - b.y) * Math.min(1, dt * 2));
        if (b.t <= 0) {
          b.cycle++;
          if (b.cycle % 2 === 1) {
            const d = towards(b.x, b.y, p.x, p.y);
            b.state = 'claw'; b.t = 0.85; b.tele = { kind: 'line', dx: d.x, dy: d.y, len: 170 };
          } else {
            b.state = 'bell'; b.t = 0.95; b.tele = { kind: 'ring', r: 56 };
          }
        }
        break;
      }
      case 'claw':
        if (b.t <= 0) {
          const { dx, dy } = b.tele;
          g.spawnHostile({ kind: 'claw', x: b.x + dx * 14, y: b.y + dy * 14, vx: dx * 230, vy: dy * 230, r: 6, dmg: 2, life: 1.2 });
          g.emit({ type: 'snap', x: b.x, y: b.y });
          b.tele = null; b.state = 'scuttle'; b.t = 1.5;
        }
        break;
      case 'bell':
        if (b.t <= 0) {
          g.spawnHostile({ kind: 'ring', x: b.x, y: b.y, r: 10, maxR: 58, grow: 120, band: 9, dmg: 1 });
          g.emit({ type: 'bell', x: b.x, y: b.y });
          g.shake(4);
          b.tele = null; b.state = 'scuttle'; b.t = 1.6;
        }
        break;
      default:
        b.state = 'scuttle';
    }
  },

  shade(b, g, dt) {
    const p = g.player;
    const lit = g.litCount();
    const wasRevealed = b.revealed;
    b.revealed = lit >= 3;
    if (b.revealed && !wasRevealed) g.emit({ type: 'reveal', x: b.x, y: b.y });
    // Drift on a slow figure-of-eight around the middle of the room.
    const a = b.anim * 0.7;
    const tx = b.home.x + Math.sin(a) * 60, ty = b.home.y + 10 + Math.sin(a * 2) * 26;
    const slow = b.revealed ? 0.45 : 1;
    g.moveEnemy(b, (tx - b.x) * Math.min(1, dt * 1.5 * slow), (ty - b.y) * Math.min(1, dt * 1.5 * slow), true);
    b.z = 4 + Math.sin(b.anim * 2) * 2;
    switch (b.state) {
      case 'rest':
        if (b.t <= 0) {
          b.cycle++;
          const step = b.cycle % 3;
          if (step === 1) { b.state = 'orbs'; b.t = 0.85; b.tele = { kind: 'glow' }; }
          // Once all three torches burn he is too dazzled to snuff one out.
          // While hidden he snuffs a torch every other round of attacks, so
          // lighting all three is a race you can win.
          else if (step === 2 && lit > 0 && !b.revealed && b.cycle % 6 === 2) {
            b.state = 'snuff'; b.t = 0.7;
            b.snuffTarget = g.pickLitTorch();
            b.tele = { kind: 'point', tile: b.snuffTarget };
          } else {
            b.state = 'sweep'; b.t = 0.95;
            b.tele = { kind: 'band', y: p.y, fromLeft: p.x > b.home.x };
          }
        }
        break;
      case 'orbs':
        if (b.t <= 0) {
          for (let i = 0; i < 3; i++) {
            const ang = (i / 3) * Math.PI * 2 + b.anim;
            g.spawnHostile({ kind: 'orb', x: b.x + Math.cos(ang) * 10, y: b.y + Math.sin(ang) * 10, vx: Math.cos(ang) * 40, vy: Math.sin(ang) * 40, r: 5, dmg: 1, life: 3.2, homing: 1, speed: 50, breakable: true });
          }
          g.emit({ type: 'orbs', x: b.x, y: b.y });
          b.tele = null; b.state = 'rest'; b.t = b.revealed ? 2.4 : 1.6;
        }
        break;
      case 'snuff':
        if (b.t <= 0) {
          // Lighting the last torch during his wind-up dazzles him too.
          if (b.snuffTarget != null && !b.revealed) g.snuffTorch(b.snuffTarget);
          b.tele = null; b.state = 'rest'; b.t = 1.2;
        }
        break;
      case 'sweep':
        if (b.t <= 0) {
          const { y, fromLeft } = b.tele;
          const left = g.roomLeft() + TILE, right = g.roomLeft() + 19 * TILE;
          g.spawnHostile({ kind: 'wave', x: fromLeft ? left : right, y, vx: fromLeft ? 150 : -150, vy: 0, r: 7, h: 9, dmg: 2, life: 2.2 });
          g.emit({ type: 'whoosh', x: b.x, y: b.y });
          b.tele = null; b.state = 'rest'; b.t = 1.4;
        }
        break;
      default:
        b.state = 'rest';
    }
  },
};

/**
 * The Shade King hides again after each third of his health: every torch goes
 * out and you light them again. Returns true when that happens.
 */
export function shadeHitThreshold(b, before) {
  const third = b.maxHp / 3;
  return Math.ceil(before / third) > Math.ceil(b.hp / third) && b.hp > 0;
}
