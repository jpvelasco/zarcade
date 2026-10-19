// Enemy behaviour. Each kind is a tiny state machine over a plain object,
// driven by the world through a narrow interface:
//   world.nearestPlayer(x, y), world.enemyShot(x, y, vx, vy, opts),
//   world.solidAt(x, y), world.standAt(x, y), world.rng, world.events
// Every attack has a visible wind-up (`e.windup`) before it lands, so
// nothing hits you without warning.

export const ENEMY = Object.freeze({
  raider: { w: 12, h: 20, hp: 2, score: 200, speed: 36 },
  sniper: { w: 12, h: 18, hp: 3, score: 300 },
  jumper: { w: 12, h: 12, hp: 1, score: 150 },
  flyer: { w: 14, h: 10, hp: 1, score: 150 },
  scorpion: { w: 14, h: 10, hp: 2, score: 200, speed: 28 },
  turret: { w: 14, h: 12, hp: 5, score: 500 },
  leaper: { w: 10, h: 12, hp: 1, score: 150 },
  log: { w: 14, h: 12, hp: Infinity, score: 0, speed: 46 },
  drone: { w: 12, h: 10, hp: 2, score: 100 },
});

export const ENEMY_SHOT_SPEED = 96;
const GRAVITY = 900;

export function createEnemy(kind, x, feetY, id, extra = {}) {
  const spec = ENEMY[kind];
  if (!spec) throw new Error(`unknown enemy ${kind}`);
  const e = {
    id,
    kind,
    x: x - spec.w / 2,
    y: feetY - spec.h,
    w: spec.w,
    h: spec.h,
    vx: 0,
    vy: 0,
    hp: spec.hp,
    maxHp: spec.hp,
    score: spec.score,
    facing: -1,
    timer: 0,
    windup: 0,
    state: 'idle',
    onGround: false,
    dead: false,
    flash: 0,
    homeX: x - spec.w / 2,
    homeY: feetY - spec.h,
    phase: 0,
    shots: 0,
    harmless: false,   // logs trip you instead of hurting
    hidden: false,     // leapers under the water, turrets folded away
    shootable: true,
    ...extra,
  };
  if (kind === 'log') { e.harmless = true; e.shootable = false; e.vx = -spec.speed; }
  if (kind === 'leaper') { e.hidden = true; e.timer = 1 + (id % 3) * 0.7; }
  if (kind === 'turret') { e.hidden = true; e.timer = 0.8; }
  if (kind === 'raider') e.timer = 1.4 + (id % 4) * 0.4;
  if (kind === 'sniper') e.timer = 1.2 + (id % 3) * 0.5;
  if (kind === 'jumper') e.timer = 0.6 + (id % 3) * 0.3;
  if (kind === 'flyer' || kind === 'drone') e.phase = (id * 1.7) % (Math.PI * 2);
  return e;
}

export const centerOf = (e) => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });

/** 8-way direction from (x, y) toward a target. */
export function aim8(fromX, fromY, toX, toY) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const step = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return { x: Math.cos(step), y: Math.sin(step) };
}

/** Simple gravity body for walkers and hoppers: lands on solid ground and ledges. */
function fall(e, world, dt) {
  e.vy = Math.min(360, e.vy + GRAVITY * dt);
  const prevBottom = e.y + e.h;
  e.y += e.vy * dt;
  e.onGround = false;
  if (e.vy >= 0) {
    const feet = e.y + e.h;
    for (const px of [e.x + 2, e.x + e.w - 2]) {
      const surface = world.standAt(px, feet, prevBottom);
      if (surface !== null) {
        e.y = surface - e.h;
        e.vy = 0;
        e.onGround = true;
        break;
      }
    }
  } else if (world.solidAt(e.x + e.w / 2, e.y)) {
    e.vy = 0;
  }
}

function walk(e, world, dt, speed) {
  const ahead = e.facing > 0 ? e.x + e.w + 2 : e.x - 2;
  const wall = world.solidAt(ahead, e.y + e.h - 4) || world.solidAt(ahead, e.y + 4);
  const floor = world.standAt(ahead, e.y + e.h + 2, e.y + e.h - 1) !== null;
  if (wall || (e.onGround && !floor)) e.facing = -e.facing;
  e.vx = e.facing * speed;
  e.x += e.vx * dt;
}

function shootAt(world, e, target, speed = ENEMY_SHOT_SPEED, eight = true) {
  const c = centerOf(e);
  const t = centerOf(target);
  const dir = eight ? aim8(c.x, c.y, t.x, t.y) : { x: Math.sign(t.x - c.x) || e.facing, y: 0 };
  world.enemyShot(c.x + dir.x * 7, c.y + dir.y * 7 - 2, dir.x * speed, dir.y * speed);
}

export function updateEnemy(e, world, dt) {
  e.flash = Math.max(0, e.flash - dt);
  const target = world.nearestPlayer(e.x + e.w / 2, e.y + e.h / 2);
  const dx = target ? target.x + target.w / 2 - (e.x + e.w / 2) : 0;
  const dy = target ? target.y + target.h / 2 - (e.y + e.h / 2) : 0;
  const near = (range) => target && Math.abs(dx) < range && Math.abs(dy) < range * 0.6;

  switch (e.kind) {
    case 'raider': {
      if (e.windup > 0) {
        e.windup -= dt;
        e.vx = 0;
        if (e.windup <= 0 && target) {
          shootAt(world, e, target, ENEMY_SHOT_SPEED, false);
          e.timer = 2.6;
        }
      } else {
        if (target && Math.abs(dx) < 240) e.facing = Math.sign(dx) || e.facing;
        if (e.onGround) walk(e, world, dt, ENEMY.raider.speed);
        e.timer -= dt;
        if (e.timer <= 0 && near(200) && Math.abs(dy) < 36) {
          e.windup = 0.45;
          e.facing = Math.sign(dx) || e.facing;
        }
      }
      fall(e, world, dt);
      break;
    }
    case 'sniper': {
      if (target) e.facing = Math.sign(dx) || e.facing;
      if (e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0 && target) {
          shootAt(world, e, target);
          e.timer = 2.3;
        }
      } else {
        e.timer -= dt;
        if (e.timer <= 0 && near(230)) e.windup = 0.5;
      }
      fall(e, world, dt);
      break;
    }
    case 'jumper': {
      if (e.onGround) {
        e.vx = 0;
        e.timer -= dt;
        if (e.timer <= 0 && near(200)) {
          e.facing = Math.sign(dx) || e.facing;
          e.vx = e.facing * 70;
          e.vy = -240;
          e.timer = 1.3;
          e.onGround = false;
        }
      } else {
        const ahead = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
        if (world.solidAt(ahead, e.y + e.h / 2)) e.vx = 0;
        e.x += e.vx * dt;
      }
      fall(e, world, dt);
      break;
    }
    case 'flyer':
    case 'drone': {
      e.phase += dt;
      if (e.state === 'swoop') {
        e.timer -= dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.timer <= 0) e.state = 'return';
      } else if (e.state === 'return') {
        e.y += (e.homeY - e.y) * Math.min(1, dt * 1.6);
        e.x += e.vx * 0.5 * dt;
        if (Math.abs(e.y - e.homeY) < 2) { e.state = 'idle'; e.timer = 1.6; e.homeX = e.x; }
      } else {
        e.x = e.homeX + Math.sin(e.phase * 1.3) * 18;
        e.y = e.homeY + Math.sin(e.phase * 2.6) * 6;
        e.timer -= dt;
        if (e.windup > 0) {
          e.windup -= dt;
          if (e.windup <= 0 && target) {
            const len = Math.max(1, Math.hypot(dx, dy));
            const speed = 82;
            e.vx = (dx / len) * speed;
            e.vy = (dy / len) * speed;
            e.state = 'swoop';
            e.timer = 1.1;
            if (e.kind === 'drone') shootAt(world, e, target, 90);
          }
        } else if (e.timer <= 0 && near(150) && dy > -10) {
          e.windup = 0.4;
        }
      }
      if (target) e.facing = Math.sign(dx) || e.facing;
      break;
    }
    case 'scorpion': {
      if (e.state === 'lunge') {
        e.timer -= dt;
        walk(e, world, dt, 92);
        if (e.timer <= 0) { e.state = 'idle'; e.timer = 1.2; }
      } else {
        walk(e, world, dt, ENEMY.scorpion.speed);
        e.timer -= dt;
        if (e.windup > 0) {
          e.windup -= dt;
          if (e.windup <= 0) { e.state = 'lunge'; e.timer = 0.5; }
        } else if (e.timer <= 0 && near(70) && Math.abs(dy) < 16) {
          e.facing = Math.sign(dx) || e.facing;
          e.windup = 0.35;
        }
      }
      fall(e, world, dt);
      break;
    }
    case 'turret': {
      if (e.hidden) {
        if (near(220)) { e.hidden = false; e.timer = 0.9; world.events.push({ type: 'turretUp', x: e.x + e.w / 2, y: e.y }); }
        break;
      }
      if (target) {
        const c = centerOf(e);
        const t = centerOf(target);
        e.aim = aim8(c.x, c.y - 3, t.x, t.y);
        e.facing = Math.sign(dx) || e.facing;
      }
      if (e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0) { e.shots = 3; e.timer = 0; }
      } else if (e.shots > 0) {
        e.timer -= dt;
        if (e.timer <= 0 && target) {
          shootAt(world, e, target, 92);
          e.shots -= 1;
          e.timer = 0.2;
          if (e.shots === 0) e.timer = 2.6;
        }
      } else {
        e.timer -= dt;
        if (e.timer <= 0 && near(230)) e.windup = 0.55;
      }
      break;
    }
    case 'leaper': {
      if (e.hidden) {
        e.timer -= dt;
        if (e.timer <= 0.4 && e.timer + dt > 0.4) world.events.push({ type: 'bubble', x: e.homeX + e.w / 2, y: e.homeY + e.h });
        e.windup = e.timer < 0.4 ? e.timer : 0;
        if (e.timer <= 0 && near(260)) {
          e.hidden = false;
          e.windup = 0;
          e.vy = -330;
          e.y = e.homeY;
          world.events.push({ type: 'splash', x: e.x + e.w / 2, y: e.homeY + e.h });
        } else if (e.timer <= 0) {
          e.timer = 0.5;
        }
      } else {
        e.vy += GRAVITY * 0.8 * dt;
        e.y += e.vy * dt;
        if (e.vy > 0 && e.y >= e.homeY) {
          e.y = e.homeY;
          e.hidden = true;
          e.timer = 2.4;
        }
      }
      break;
    }
    case 'log': {
      e.x += e.vx * dt;
      e.phase += e.vx * dt / 7;
      e.timer += dt;
      if (e.timer > 9) e.dead = true;
      break;
    }
    default:
      break;
  }
}

/** Can this enemy be hit (and can it hurt you) right now? */
export function isActiveBody(e) {
  return !e.dead && !e.hidden;
}
