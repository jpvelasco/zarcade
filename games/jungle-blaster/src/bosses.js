// Bosses: big multi-phase fights at the end of each stage.
//
// A boss runs a fixed, repeating list of attacks for its current phase
// (phases change at 2/3 and 1/3 health). Each attack starts with a wind-up
// the player can see (at least WINDUP_MIN seconds) before anything dangerous
// appears. Attacks talk to the world through:
//   world.enemyShot(x, y, vx, vy, opts)   projectiles and hazard zones
//   world.marker(x, y, w, h, life, kind)  telegraphs drawn on the ground
//   world.spawnEnemy(kind, x, y)          summoned minions
//   world.nearestPlayer(x, y), world.events

export const WINDUP_MIN = 0.35;
export const PHASE_REST = [1.0, 0.75, 0.55];
const BARREL_FLIGHT = 0.9;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const centerX = (b) => b.x + b.w / 2;
const playerX = (world, b) => {
  const p = world.nearestPlayer(centerX(b), b.y + b.h / 2);
  return p ? p.x + p.w / 2 : centerX(b) - 80;
};
const playerCenter = (world, b) => {
  const p = world.nearestPlayer(centerX(b), b.y + b.h / 2);
  return p ? { x: p.x + p.w / 2, y: p.y + p.h / 2 } : { x: centerX(b) - 80, y: b.floor - 10 };
};
function aimed(world, x, y, target, speed, spread = 0) {
  const angle = Math.atan2(target.y - y, target.x - x) + spread;
  world.enemyShot(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, { r: 3 });
}
function ring(world, x, y, count, speed, offset = 0) {
  for (let i = 0; i < count; i += 1) {
    const angle = offset + (i / count) * Math.PI * 2;
    world.enemyShot(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, { r: 3, life: 5 });
  }
}
function shockwaves(world, b, x) {
  world.enemyShot(x - 8, b.floor - 7, -120, 0, { kind: 'wave', w: 10, h: 14, life: 4 });
  world.enemyShot(x + 8, b.floor - 7, 120, 0, { kind: 'wave', w: 10, h: 14, life: 4 });
  world.events.push({ type: 'quake', x, y: b.floor, power: 1 });
}

// ------------------------------------------------------------------ specs

export const BOSSES = {
  gorilla: {
    name: 'KONG-TRON 2600',
    hp: 60,
    w: 44,
    h: 52,
    place: (a) => ({ x: a.x1 - 76, y: a.floor - 52 }),
    phases: [
      ['barrel', 'beat', 'pound', 'barrel'],
      ['barrel', 'leap', 'pound', 'barrel', 'barrel'],
      ['laser', 'leap', 'barrel', 'pound', 'laser'],
    ],
    actions: {
      beat: { windup: 0.5, dur: 1.1, tick(b, w, t, at) { if (at(0.5)) w.events.push({ type: 'roar', boss: b.type }); } },
      barrel: {
        windup: 0.5,
        dur: 0.9,
        // Lobbed at the runner's spot (a glowing column marks where it lands),
        // then it sits a moment and rolls on: step aside, then jump or shoot it.
        begin(b, w) {
          b.barrelX = clamp(playerX(w, b), b.arena.x0 + 6, b.arena.x1 - 6);
          if (Math.abs(b.barrelX - centerX(b)) > 12) b.facing = b.barrelX < centerX(b) ? -1 : 1;
          w.marker(b.barrelX - 7, b.floor - 3, 14, 3, 0.5 + BARREL_FLIGHT, 'land');
        },
        tick(b, w, t, at) {
          if (at(0.5)) {
            const fromX = centerX(b) + b.facing * 18;
            const fromY = b.y + 10;
            const g = 700;
            const vx = (b.barrelX - fromX) / BARREL_FLIGHT;
            const vy = ((b.floor - 7 - fromY) - 0.5 * g * BARREL_FLIGHT * BARREL_FLIGHT) / BARREL_FLIGHT;
            w.enemyShot(fromX, fromY, vx, vy, { kind: 'barrel', r: 7, gravity: g, life: 6, hp: 2, roll: 105 });
          }
        },
      },
      pound: { windup: 0.6, dur: 1.0, tick(b, w, t, at) { if (at(0.6)) shockwaves(w, b, centerX(b)); } },
      leap: {
        windup: 0.5,
        dur: 1.5,
        begin(b, w) {
          b.from = b.x;
          b.to = b.x > (b.arena.x0 + b.arena.x1) / 2 ? b.arena.x0 + 32 : b.arena.x1 - 32 - b.w;
          w.marker(b.to, b.floor - 4, b.w, 4, 1.4, 'land');
        },
        tick(b, w, t, at) {
          if (t < 0.5) return;
          const k = Math.min(1, (t - 0.5) / 0.85);
          b.x = b.from + (b.to - b.from) * k;
          b.y = b.home.y - Math.sin(k * Math.PI) * 70;
          if (at(1.35)) {
            b.y = b.home.y;
            b.facing = b.x > (b.arena.x0 + b.arena.x1) / 2 ? -1 : 1;
            shockwaves(w, b, centerX(b));
          }
        },
        finish(b) { b.y = b.home.y; },
      },
      laser: {
        windup: 0.75,
        dur: 1.5,
        begin(b, w) {
          // Turn to face the runner first: standing behind it is no hiding place.
          if (Math.abs(playerX(w, b) - centerX(b)) > 12) b.facing = playerX(w, b) < centerX(b) ? -1 : 1;
          b.beamY = b.floor - 22;
          const x0 = b.facing < 0 ? b.arena.x0 : centerX(b);
          const x1 = b.facing < 0 ? centerX(b) : b.arena.x1;
          w.marker(x0, b.beamY + 3, x1 - x0, 2, 0.75, 'hbeam');
        },
        tick(b, w, t, at) {
          if (at(0.75)) {
            const x0 = b.facing < 0 ? b.arena.x0 : centerX(b);
            const x1 = b.facing < 0 ? centerX(b) - 10 : b.arena.x1;
            w.enemyShot(x0, b.beamY, 0, 0, { kind: 'beam', w: x1 - x0, h: 8, life: 0.55, absolute: true });
            w.events.push({ type: 'laserBlast', x: centerX(b), y: b.beamY });
          }
        },
      },
    },
  },

  croc: {
    name: 'IRON CROC',
    hp: 70,
    w: 64,
    h: 30,
    place: (a) => ({ x: a.x1 - 92, y: a.floor - 30 }),
    phases: [
      ['torpedo', 'snap', 'torpedo'],
      ['mortar', 'torpedo', 'snap', 'mortar'],
      ['mortar', 'torpedo', 'snap', 'mortar', 'torpedo'],
    ],
    actions: {
      torpedo: {
        windup: 0.45,
        dur: 1.2,
        tick(b, w, t, at) {
          for (const when of [0.45, 0.85]) {
            if (at(when)) w.enemyShot(b.x - 4, b.floor - 6, -135, 0, { kind: 'torpedo', w: 12, h: 6, life: 4, hp: 1 });
          }
        },
      },
      snap: {
        windup: 0.6,
        dur: 1.9,
        // The lunge reaches the runner's spot (shown on the floor while the
        // jaws open), at a readable speed: back out of the strip, or jump the
        // snout. It stops short of the far wall.
        begin(b, w) {
          b.from = b.home.x;
          b.reach = clamp(b.from - (playerX(w, b) - 8), 110, b.from - (b.arena.x0 + 20));
          b.lunge = clamp(b.reach / 330, 0.4, 0.7);
          w.marker(b.from - b.reach - 2, b.floor - 3, b.reach, 3, 0.6 + b.lunge, 'reach');
        },
        tick(b, w, t) {
          if (t < 0.6) { b.jaw = Math.min(1, t / 0.6); return; }
          const out = 0.6 + b.lunge;
          const k = t < out ? (t - 0.6) / b.lunge : Math.max(0, 1 - (t - out) / 0.6);
          b.x = b.from - k * b.reach;
          b.jaw = t < out ? 1 : 0.2;
        },
        finish(b) { b.x = b.home.x; b.jaw = 0; },
      },
      mortar: {
        windup: 0.5,
        dur: 1.6,
        begin(b, w) {
          const px = playerX(w, b);
          // Reach right into the corners, so the wall is no hiding place.
          b.targets = [px - 40, px, px + 40].map((x) => clamp(x, b.arena.x0 + 4, b.arena.x1 - 4));
          for (const x of b.targets) w.marker(x - 8, b.floor - 3, 16, 3, 1.5, 'target');
        },
        tick(b, w, t, at) {
          b.targets.forEach((x, i) => {
            if (at(0.5 + i * 0.15)) {
              const fromX = b.x + 20;
              const fromY = b.y - 4;
              const time = 1.0;
              const g = 500;
              w.enemyShot(fromX, fromY, (x - fromX) / time, ((b.floor - 4 - fromY) - 0.5 * g * time * time) / time, { kind: 'shell', r: 4, gravity: g, life: 3 });
            }
          });
        },
      },
    },
  },

  mole: {
    name: 'DRILL MOLE',
    hp: 80,
    w: 40,
    h: 36,
    place: (a) => ({ x: a.x1 - 80, y: a.floor - 36 }),
    phases: [
      ['rocks', 'burrow'],
      ['burrow', 'rocks', 'burrow'],
      ['spin', 'burrow', 'rocks', 'spin'],
    ],
    actions: {
      rocks: {
        windup: 0.5,
        dur: 1.8,
        // A comb of rocks, one right over the runner: step into a gap.
        begin(b, w) {
          const lo = b.arena.x0 + 8;
          const px = clamp(Math.floor(playerX(w, b)), lo, b.arena.x1 - 8);
          b.targets = [];
          for (let x = lo + ((px - lo) % 64); x <= b.arena.x1 - 8; x += 64) b.targets.push(x);
          for (const x of b.targets) w.marker(x - 6, b.floor - 3, 12, 3, 1.4, 'dust');
        },
        tick(b, w, t, at) {
          if (at(0.4)) w.events.push({ type: 'quake', x: centerX(b), y: b.floor, power: 0.6 });
          b.targets.forEach((x, i) => {
            if (at(0.6 + i * 0.12)) w.enemyShot(x, b.arena.top + 6, 0, 30, { kind: 'rock', r: 5, gravity: 520, life: 3, hp: 1 });
          });
        },
      },
      burrow: {
        windup: 0.4,
        dur: 3.0,
        begin(b) { b.underground = false; },
        tick(b, w, t, at) {
          if (at(0.4)) { b.underground = true; w.events.push({ type: 'dig', x: centerX(b), y: b.floor }); }
          if (at(0.6)) {
            b.digX = clamp(playerX(w, b) - b.w / 2, b.arena.x0 + 2, b.arena.x1 - 2 - b.w);
            w.marker(b.digX, b.floor - 4, b.w, 4, 0.8, 'dust');
          }
          if (at(1.4)) {
            b.x = b.digX;
            b.underground = false;
            b.y = b.home.y + 20;
            w.enemyShot(b.x, b.floor - 28, 0, 0, { kind: 'beam', w: b.w, h: 28, life: 0.3, absolute: true, style: 'erupt' });
            w.events.push({ type: 'erupt', x: centerX(b), y: b.floor });
          }
          if (t > 1.4) b.y = b.home.y + Math.max(0, 20 - (t - 1.4) * 120);
        },
        finish(b) { b.underground = false; b.y = b.home.y; },
      },
      spin: {
        windup: 0.6,
        dur: 2.0,
        begin(b) {
          b.from = b.x;
          b.to = b.x > (b.arena.x0 + b.arena.x1) / 2 ? b.arena.x0 + 20 : b.arena.x1 - 20 - b.w;
        },
        tick(b, w, t) {
          if (t < 0.6) { b.spin = t / 0.6; return; }
          const k = Math.min(1, (t - 0.6) / 1.0);
          b.x = b.from + (b.to - b.from) * k;
          b.spin = 1;
          b.facing = b.to < b.from ? -1 : 1;
        },
        finish(b) { b.spin = 0; b.facing = b.x > (b.arena.x0 + b.arena.x1) / 2 ? -1 : 1; },
      },
    },
  },

  idol: {
    name: 'THE GOLDEN IDOL',
    hp: 90,
    w: 52,
    h: 52,
    flying: true,
    place: (a) => ({ x: a.x1 - 90, y: a.floor - 100 }),
    phases: [
      ['fireballs', 'drift', 'eyes'],
      ['summon', 'fireballs', 'drift', 'eyes'],
      ['spiral', 'drift', 'fireballs', 'summon', 'spiral'],
    ],
    actions: {
      fireballs: {
        windup: 0.55,
        dur: 1.1,
        tick(b, w, t, at) {
          if (at(0.55)) {
            const target = playerCenter(w, b);
            for (const s of [-0.36, -0.18, 0, 0.18, 0.36]) aimed(w, centerX(b), b.y + 40, target, 80, s);
            w.events.push({ type: 'boom', x: centerX(b), y: b.y + 40 });
          }
        },
      },
      eyes: {
        windup: 0.5,
        dur: 1.6,
        tick(b, w, t, at) {
          for (const when of [0.5, 0.85, 1.2]) {
            if (at(when)) {
              const target = playerCenter(w, b);
              aimed(w, b.x + 15, b.y + 20, target, 95);
              aimed(w, b.x + b.w - 15, b.y + 20, target, 95);
            }
          }
        },
      },
      summon: {
        windup: 0.6,
        dur: 1.0,
        tick(b, w, t, at) {
          if (at(0.6)) {
            w.spawnEnemy('flyer', b.x - 10, b.y + 20);
            w.spawnEnemy('flyer', b.x + b.w + 10, b.y + 34);
          }
        },
      },
      drift: {
        windup: 0.35,
        dur: 1.6,
        begin(b) {
          b.from = b.x;
          b.to = b.x > (b.arena.x0 + b.arena.x1) / 2 ? b.arena.x0 + 40 : b.arena.x1 - 40 - b.w;
        },
        tick(b, w, t) {
          const k = Math.min(1, Math.max(0, (t - 0.35) / 1.2));
          const ease = k * k * (3 - 2 * k);
          b.x = b.from + (b.to - b.from) * ease;
        },
      },
      spiral: {
        windup: 0.6,
        dur: 1.8,
        tick(b, w, t, at) {
          for (let i = 0; i < 3; i += 1) if (at(0.6 + i * 0.4)) ring(w, centerX(b), b.y + 30, 10, 58, i * 0.31);
        },
      },
    },
  },

  wyrm: {
    name: 'MAGMA WYRM',
    hp: 100,
    w: 30,
    h: 26,
    place: (a) => ({ x: a.x1 - 44, y: a.floor - 34 }),
    phases: [
      ['spit', 'arc', 'spit'],
      ['rain', 'arc', 'spit', 'arc'],
      ['pillars', 'arc', 'rain', 'spit', 'pillars'],
    ],
    actions: {
      spit: {
        windup: 0.5,
        dur: 1.4,
        begin(b) { b.y = b.home.y; },
        tick(b, w, t, at) {
          for (const [when, lead] of [[0.5, -30], [0.75, 0], [1.0, 30]]) {
            if (at(when)) {
              const tx = playerX(w, b) + lead;
              const fromX = centerX(b);
              const fromY = b.y + 8;
              const time = 1.1;
              const g = 420;
              w.enemyShot(fromX, fromY, (tx - fromX) / time, ((b.floor - 4 - fromY) - 0.5 * g * time * time) / time, { kind: 'fire', r: 4, gravity: g, life: 3 });
            }
          }
        },
      },
      arc: {
        windup: 0.5,
        dur: 2.2,
        begin(b, w) {
          b.from = b.x;
          b.to = b.x > (b.arena.x0 + b.arena.x1) / 2 ? b.arena.x0 + 12 : b.arena.x1 - 12 - b.w;
          w.marker(b.to - 6, b.floor - 4, b.w + 12, 4, 1.8, 'land');
        },
        tick(b, w, t) {
          if (t < 0.5) { b.y = b.home.y + (t / 0.5) * 6; return; }
          const k = Math.min(1, (t - 0.5) / 1.5);
          b.x = b.from + (b.to - b.from) * k;
          b.y = b.home.y + 6 - Math.sin(k * Math.PI) * 96;
          b.facing = b.to < b.from ? -1 : 1;
        },
        finish(b) { b.y = b.home.y; b.facing = b.x > (b.arena.x0 + b.arena.x1) / 2 ? -1 : 1; },
      },
      rain: {
        windup: 0.6,
        dur: 2.0,
        begin(b, w) {
          const px = playerX(w, b);
          b.targets = [];
          for (let i = 0; i < 6; i += 1) b.targets.push(b.arena.x0 + 20 + ((i * 52 + Math.floor(px * 0.5)) % 290));
          for (const x of b.targets) w.marker(x - 6, b.floor - 3, 12, 3, 1.6, 'target');
        },
        tick(b, w, t, at) {
          if (at(0.4)) w.events.push({ type: 'roar', boss: b.type });
          b.targets.forEach((x, i) => {
            if (at(0.7 + i * 0.12)) w.enemyShot(x, b.arena.top + 4, 0, 40, { kind: 'fire', r: 4, gravity: 360, life: 3 });
          });
        },
      },
      pillars: {
        windup: 0.8,
        dur: 1.8,
        begin(b, w) {
          const px = playerX(w, b);
          b.targets = [px - 20, b.arena.x0 + 60 + ((Math.floor(px) * 7) % 200), b.arena.x1 - 70].map((x) => Math.max(b.arena.x0 + 8, Math.min(b.arena.x1 - 24, x)));
          for (const x of b.targets) w.marker(x, b.floor - 4, 16, 4, 0.8, 'column');
        },
        tick(b, w, t, at) {
          if (at(0.8)) {
            for (const x of b.targets) w.enemyShot(x, b.floor - 70, 0, 0, { kind: 'beam', w: 16, h: 70, life: 0.7, absolute: true, style: 'pillar' });
            w.events.push({ type: 'erupt', x: b.targets[0], y: b.floor });
          }
        },
      },
    },
  },

  mothership: {
    name: 'THE MOTHERSHIP',
    hp: 130,
    w: 112,
    h: 34,
    flying: true,
    hover: (b, w) => { b.x = b.home.x + Math.sin(w.t * 0.45) * 70; },
    place: (a) => ({ x: (a.x0 + a.x1) / 2 - 56, y: a.top + 24 }),
    phases: [
      ['volley', 'drones', 'volley'],
      ['beam', 'volley', 'drones'],
      ['spiral', 'beam', 'volley', 'spiral', 'drones'],
    ],
    actions: {
      volley: {
        windup: 0.5,
        dur: 1.6,
        tick(b, w, t, at) {
          const guns = [b.x + 14, b.x + b.w - 14];
          for (const [i, when] of [0.5, 0.8, 1.1, 1.4].entries()) {
            if (at(when)) aimed(w, guns[i % 2], b.y + b.h - 4, playerCenter(w, b), 92);
          }
        },
      },
      drones: {
        windup: 0.6,
        dur: 1.2,
        tick(b, w, t, at) {
          if (at(0.6)) {
            const live = w.enemies.filter((e) => e.kind === 'drone' && !e.dead).length;
            if (live < 4) {
              w.spawnEnemy('drone', b.x + 24, b.y + b.h + 8);
              w.spawnEnemy('drone', b.x + b.w - 24, b.y + b.h + 8);
            }
          }
        },
      },
      beam: {
        windup: 0.85,
        dur: 2.4,
        begin(b, w) {
          b.beamX = Math.max(b.arena.x0 + 4, Math.min(b.arena.x1 - 28, playerX(w, b) - 12));
          w.marker(b.beamX, b.floor - 4, 24, 4, 0.85, 'column');
        },
        tick(b, w, t, at) {
          if (at(0.85)) {
            const top = b.y + b.h;
            w.enemyShot(b.beamX, top, playerX(w, b) > b.beamX + 12 ? 26 : -26, 0, { kind: 'beam', w: 24, h: b.floor - top, life: 1.4, absolute: true, style: 'tractor' });
            w.events.push({ type: 'laserBlast', x: b.beamX + 12, y: top });
          }
        },
      },
      spiral: {
        windup: 0.6,
        dur: 2.0,
        tick(b, w, t, at) {
          for (let i = 0; i < 3; i += 1) if (at(0.6 + i * 0.45)) ring(w, centerX(b), b.y + b.h, 12, 56, i * 0.26);
        },
      },
    },
  },
};

// --------------------------------------------------------------- runtime

export function createBoss(type, arena, { hpScale = 1 } = {}) {
  const spec = BOSSES[type];
  if (!spec) throw new Error(`unknown boss ${type}`);
  const at = spec.place(arena);
  const hp = Math.round(spec.hp * hpScale);
  return {
    type,
    name: spec.name,
    x: at.x,
    y: at.y,
    w: spec.w,
    h: spec.h,
    home: { x: at.x, y: at.y },
    floor: arena.floor,
    arena,
    hp,
    maxHp: hp,
    phase: 0,
    step: 0,
    action: null,
    actionTime: 0,
    rest: 1.4,            // a moment to read the boss before it attacks
    facing: -1,
    flash: 0,
    intro: 1.6,
    dying: 0,
    dead: false,
    underground: false,
    jaw: 0,
    spin: 0,
    history: [],
  };
}

export function phaseFor(boss) {
  const ratio = boss.hp / boss.maxHp;
  return ratio > 2 / 3 ? 0 : ratio > 1 / 3 ? 1 : 2;
}

/** Can bullets hit the boss (and does its body hurt) right now? */
export function bossVulnerable(boss) {
  return !boss.dead && boss.dying <= 0 && boss.intro <= 0 && !boss.underground;
}

export function bossBox(boss) {
  if (boss.type === 'mothership') return { x: boss.x + 6, y: boss.y + 8, w: boss.w - 12, h: boss.h - 8 };
  return { x: boss.x + 3, y: boss.y + 3, w: boss.w - 6, h: boss.h - 3 };
}

export function damageBoss(boss, amount, world) {
  if (!bossVulnerable(boss)) return false;
  boss.hp = Math.max(0, boss.hp - amount);
  boss.flash = 0.08;
  const phase = phaseFor(boss);
  if (phase !== boss.phase && boss.hp > 0) {
    boss.phase = phase;
    boss.step = 0;
    world.events.push({ type: 'bossPhase', phase, x: boss.x + boss.w / 2, y: boss.y + boss.h / 2 });
  }
  if (boss.hp <= 0) {
    boss.dying = 2.6;
    if (boss.action) finishAction(boss, world);
    world.events.push({ type: 'bossDown', x: boss.x + boss.w / 2, y: boss.y + boss.h / 2, boss: boss.type });
  }
  return true;
}

function finishAction(boss, world) {
  const spec = BOSSES[boss.type].actions[boss.action];
  if (spec && spec.finish) spec.finish(boss, world);
  boss.action = null;
}

export function updateBoss(boss, world, dt) {
  boss.flash = Math.max(0, boss.flash - dt);
  if (boss.dead) return;
  if (boss.dying > 0) {
    const before = boss.dying;
    boss.dying -= dt;
    if (Math.floor(before * 7) !== Math.floor(boss.dying * 7)) {
      world.events.push({ type: 'explode', x: boss.x + ((before * 97) % 1) * boss.w, y: boss.y + ((before * 61) % 1) * boss.h, size: 2 });
    }
    if (boss.flying) boss.y += 18 * dt;
    if (boss.dying <= 0) {
      boss.dead = true;
      world.events.push({ type: 'explode', x: boss.x + boss.w / 2, y: boss.y + boss.h / 2, size: 4 });
    }
    return;
  }
  if (boss.intro > 0) {
    boss.intro -= dt;
    return;
  }
  const spec = BOSSES[boss.type];
  if (spec.flying && !boss.action) boss.y = boss.home.y + Math.sin(world.t * 1.6) * 5;
  if (spec.hover) spec.hover(boss, world);
  if (!boss.action) {
    boss.rest -= dt;
    if (boss.rest > 0) return;
    const list = spec.phases[boss.phase];
    boss.action = list[boss.step % list.length];
    boss.step += 1;
    boss.actionTime = 0;
    boss.history.push(boss.action);
    if (boss.history.length > 32) boss.history.shift();
    const action = spec.actions[boss.action];
    if (action.begin) action.begin(boss, world);
    world.events.push({ type: 'bossWindup', boss: boss.type, action: boss.action });
  }
  const action = spec.actions[boss.action];
  const prev = boss.actionTime;
  boss.actionTime += dt;
  const t = boss.actionTime;
  const at = (when) => prev < when && t >= when;
  boss.windup = t < action.windup;
  if (action.tick) action.tick(boss, world, t, at);
  if (t >= action.dur) {
    finishAction(boss, world);
    boss.rest = PHASE_REST[boss.phase];
    boss.windup = false;
  }
}
