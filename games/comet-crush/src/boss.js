// Bosses: one big creature per constellation. Each boss moves along a
// deterministic path, may own "parts" (bricks attached to it that follow it
// around and can regrow), and may shoot slow projectiles at the ship.
import { FIELD } from './config.js';
import { lerp, smooth } from './math.js';

const CX = FIELD.w / 2;

export const BOSSES = {
  saucer: {
    name: 'Bubble Saucer', hp: 36, w: 150, h: 58, color: '#5ef2ff',
    path: (t) => ({ x: CX + Math.sin(t * 0.7) * 160, y: 190 + Math.sin(t * 1.7) * 10 }),
    shoot: { kind: 'bubble', every: 2.6, first: 2 },
  },
  octopus: {
    name: 'Big Space Octopus', hp: 45, w: 190, h: 100, color: '#b86bff',
    path: (t) => ({ x: CX + Math.sin(t * 0.4) * 50, y: 160 + Math.sin(t * 1.3) * 6 }),
    shoot: { kind: 'bubble', every: 4.2, first: 3 },
    tentacles: { xs: [-110, -66, -22, 22, 66, 110], len: 5, w: 36, regrow: 5 },
  },
  crab: {
    name: 'Crystal Crab', hp: 42, w: 140, h: 64, color: '#ff7ae0',
    path: (t) => ({ x: CX + Math.sin(t * 0.8) * 150, y: 200 }),
    claws: { w: 60, h: 40, cycle: 6, closed: 3.4, move: 0.4 },
  },
  serpent: {
    name: 'Star Serpent', hp: 48, w: 54, h: 54, color: '#6bffb8',
    path: (t) => ({ x: CX + Math.sin(t * 0.55) * 200, y: 235 + Math.sin(t * 1.1) * 85 }),
    shoot: { kind: 'bubble', every: 3.4, first: 3 },
    segments: { count: 10, size: 34, gap: 0.17 },
  },
  mech: {
    name: 'Gumball Mech', hp: 54, w: 200, h: 84, color: '#ff5fa2',
    path: (t) => ({ x: CX + Math.sin(t * 0.45) * 120, y: 180 + Math.sin(t * 0.9) * 8 }),
    shoot: { kind: 'meteor', every: 2.3, first: 2.5 },
    wall: { count: 6, w: 40, h: 20, regrow: 7 },
  },
  kraken: {
    name: 'Kraken Queen', hp: 66, w: 200, h: 104, color: '#d44fff',
    path: (t) => ({ x: CX + Math.sin(t * 0.5) * 80, y: 165 + Math.sin(t * 1.2) * 6 }),
    shoot: { kind: 'bubble', every: 3, first: 2.5, alt: 'meteor' },
    tentacles: { xs: [-96, -32, 32, 96], len: 6, w: 40, regrow: 6 },
  },
};

export const BOSS_KINDS = Object.keys(BOSSES);

export function createBoss(world, kind) {
  const def = BOSSES[kind];
  const start = def.path(0);
  const boss = {
    kind, def, name: def.name, x: start.x, y: start.y, w: def.w, h: def.h,
    hp: def.hp, maxHp: def.hp, t: 0, flash: 0, invuln: 0, dead: false,
    shootTimer: def.shoot ? def.shoot.first : 0, shots: 0, clawOpen: 0, parts: [],
  };
  const color = def.color;
  if (def.tentacles) {
    const tc = def.tentacles;
    tc.xs.forEach((rx, i) => {
      for (let j = 0; j < tc.len; j++) {
        const relX = rx + Math.sin(j * 0.8 + i * 1.3) * 5;
        const relY = def.h / 2 + 11 + j * 23;
        boss.parts.push(world.addBrick({
          kind: 'normal', w: tc.w - j * 2, h: 22, hp: 1, color, skin: 'tentacle',
          part: { relX, relY, regrow: tc.regrow + j * 0.35, timer: 0, order: j },
        }));
      }
    });
  }
  if (def.claws) {
    for (const side of [-1, 1]) {
      boss.parts.push(world.addBrick({
        kind: 'metal', w: def.claws.w, h: def.claws.h, hp: Infinity, color, skin: 'claw',
        part: { side, relX: 0, relY: 0, regrow: 0, timer: 0, order: 0 },
      }));
    }
  }
  if (def.segments) {
    const sg = def.segments;
    for (let i = 0; i < sg.count; i++) {
      boss.parts.push(world.addBrick({
        kind: 'tough', w: sg.size - i, h: sg.size - i, hp: 2, color, skin: 'segment',
        part: { relX: 0, relY: 0, regrow: 0, timer: 0, order: i },
      }));
    }
  }
  if (def.wall) {
    const wl = def.wall;
    for (let i = 0; i < wl.count; i++) {
      boss.parts.push(world.addBrick({
        kind: 'normal', w: wl.w, h: wl.h, hp: 1, color: '#fff38c', skin: 'wall',
        part: { relX: -105 + i * 42, relY: def.h / 2 + 18, regrow: wl.regrow, timer: 0, order: i },
      }));
    }
  }
  placeParts(boss);
  return boss;
}

export const enraged = (boss) => boss.hp <= boss.maxHp / 2;

// How open the crab's claws are (0 closed under the body, 1 wide open).
export function clawOpenness(def, t) {
  const c = def.claws;
  const p = t % c.cycle;
  if (p < c.closed) return 0;
  if (p < c.closed + c.move) return smooth((p - c.closed) / c.move);
  if (p < c.cycle - c.move) return 1;
  return smooth((c.cycle - p) / c.move);
}

function placeParts(boss) {
  const { def } = boss;
  if (def.claws) boss.clawOpen = clawOpenness(def, boss.t);
  for (const part of boss.parts) {
    const pt = part.part;
    let cx, cy;
    if (part.skin === 'segment') {
      const q = def.path(boss.t - (pt.order + 1) * def.segments.gap);
      cx = q.x; cy = q.y;
    } else if (part.skin === 'claw') {
      const o = boss.clawOpen;
      cx = boss.x + pt.side * lerp(def.claws.w / 2 + 4, def.w / 2 + def.claws.w / 2 + 6, o);
      cy = boss.y + lerp(def.h / 2 + 16, 0, o);
    } else {
      cx = boss.x + pt.relX;
      cy = boss.y + pt.relY;
    }
    part.x = cx - part.w / 2;
    part.y = cy - part.h / 2;
  }
}

export function updateBoss(world, boss, dt) {
  if (boss.dead) return;
  const angry = enraged(boss);
  boss.t += dt * (angry ? 1.25 : 1);
  boss.flash = Math.max(0, boss.flash - dt * 4);
  boss.invuln -= dt;
  const pos = boss.def.path(boss.t);
  boss.x = pos.x;
  boss.y = pos.y;
  placeParts(boss);

  for (const part of boss.parts) {
    const pt = part.part;
    if (part.alive || !pt.regrow) continue;
    pt.timer -= dt * (angry ? 1.4 : 1);
    if (pt.timer <= 0 && !world.ballOverlaps(part)) {
      part.alive = true;
      part.hp = part.maxHp;
      part.flash = 1;
      world.emit({ type: 'regrow', x: part.x + part.w / 2, y: part.y + part.h / 2, color: part.color });
    }
  }

  const sh = boss.def.shoot;
  if (sh) {
    boss.shootTimer -= dt;
    if (boss.shootTimer <= 0) {
      boss.shootTimer = sh.every * (angry ? 0.7 : 1);
      boss.shots++;
      const kind = sh.alt && angry && boss.shots % 2 === 0 ? sh.alt : sh.kind;
      world.spawnShot(kind, boss);
    }
  }
}
