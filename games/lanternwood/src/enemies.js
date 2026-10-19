// Enemies with small, readable behaviours. Every attack is telegraphed: a
// squash before a hop, a flap before a swoop, a glow before a spin. Each
// update gets the enemy, the game (for the player, movement and spawning)
// and the frame time. Health is in half hearts (the sword deals 2).
import { TILE } from './tiles.js';
import { towards } from './combat.js';

export const ENEMY_TYPES = {
  slime: { hp: 2, dmg: 1, hw: 5, hh: 4, speed: 52, drop: 0.55 },
  bat: { hp: 2, dmg: 1, hw: 5, hh: 4, fly: true, speed: 40, drop: 0.5 },
  beetle: { hp: 4, dmg: 2, hw: 6, hh: 5, armored: true, speed: 30, drop: 0.7 },
  wisp: { hp: 4, dmg: 1, hw: 5, hh: 5, fly: true, ghost: true, speed: 24, drop: 0.6, emberWeak: true },
  bigslime: { hp: 10, dmg: 2, hw: 11, hh: 9, heavy: true, speed: 60, mini: true, drop: 1 },
  shellbeetle: { hp: 10, dmg: 2, hw: 11, hh: 9, heavy: true, armored: true, speed: 34, mini: true, drop: 1 },
  gearknight: { hp: 10, dmg: 2, hw: 8, hh: 8, heavy: true, armored: true, speed: 30, mini: true, drop: 1 },
};

export const ENEMY_NAMES = {
  slime: 'Slime', bat: 'Bat', beetle: 'Beetle', wisp: 'Shadow Wisp',
  bigslime: 'Big Slime', shellbeetle: 'Shellbeetle', gearknight: 'Gear Knight',
};

const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function makeEnemy(kind, x, y, extra = {}) {
  const t = ENEMY_TYPES[kind];
  return {
    kind, x, y, hw: t.hw, hh: t.hh, hp: t.hp, maxHp: t.hp, dmg: t.dmg,
    armored: !!t.armored, heavy: !!t.heavy, fly: !!t.fly, ghost: !!t.ghost, mini: !!t.mini,
    face: { x: 0, y: 1 }, iframes: 0, kb: null, stun: 0, t: 0.4 + (extra.delay || 0),
    state: 'idle', vx: 0, vy: 0, anim: 0, tele: null, z: 0, alive: true, ...extra,
  };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function updateEnemy(e, game, dt) {
  e.anim += dt;
  if (e.iframes > 0) e.iframes -= dt;
  if (e.stun > 0) {
    e.stun -= dt;
    e.tele = null;
    return;
  }
  const fn = UPDATE[e.kind];
  if (fn) fn(e, game, dt);
}

const UPDATE = {
  slime(e, g, dt) {
    const p = g.player;
    e.t -= dt;
    if (e.state === 'idle') {
      if (e.t <= 0) {
        e.state = 'squash';
        e.t = 0.25;
      }
    } else if (e.state === 'squash') {
      if (e.t <= 0) {
        const near = dist(e, p) < 6 * TILE;
        const d = near ? towards(e.x, e.y, p.x, p.y) : randomDir(g.rng);
        e.vx = d.x * ENEMY_TYPES.slime.speed;
        e.vy = d.y * ENEMY_TYPES.slime.speed;
        e.state = 'hop';
        e.t = 0.38;
        g.emit({ type: 'hop', x: e.x, y: e.y, small: true });
      }
    } else if (e.state === 'hop') {
      g.moveEnemy(e, e.vx * dt, e.vy * dt);
      e.z = Math.sin((1 - e.t / 0.38) * Math.PI) * 5;
      if (e.t <= 0) { e.state = 'idle'; e.t = g.rng.range(0.5, 1.1); e.z = 0; }
    }
  },

  bat(e, g, dt) {
    const p = g.player;
    e.t -= dt;
    if (e.state === 'idle') {
      // Lazy figure-of-eight flutter around its home.
      e.home ||= { x: e.x, y: e.y };
      const a = e.anim * 1.7;
      const tx = e.home.x + Math.cos(a) * 18, ty = e.home.y + Math.sin(a * 2) * 9;
      g.moveEnemy(e, (tx - e.x) * Math.min(1, dt * 3), (ty - e.y) * Math.min(1, dt * 3));
      if (e.t <= 0 && dist(e, p) < 5 * TILE) { e.state = 'flap'; e.t = 0.45; }
      else if (e.t <= 0) e.t = 0.5;
    } else if (e.state === 'flap') {
      if (e.t <= 0) {
        const d = towards(e.x, e.y, p.x, p.y);
        e.vx = d.x * 120; e.vy = d.y * 120;
        e.state = 'swoop'; e.t = 0.6;
        g.emit({ type: 'swoop', x: e.x, y: e.y });
      }
    } else if (e.state === 'swoop') {
      g.moveEnemy(e, e.vx * dt, e.vy * dt);
      if (e.t <= 0) { e.state = 'idle'; e.home = { x: e.x, y: e.y }; e.t = g.rng.range(0.9, 1.6); }
    }
  },

  beetle(e, g, dt) {
    e.t -= dt;
    if (e.state === 'idle' || e.t <= 0) {
      const d = g.rng.pick(DIR4);
      e.face = { x: d[0], y: d[1] };
      e.state = 'walk';
      e.t = g.rng.range(1.2, 2.6);
    }
    const sp = ENEMY_TYPES.beetle.speed;
    const hit = g.moveEnemy(e, e.face.x * sp * dt, e.face.y * sp * dt);
    if (hit) { e.face = { x: -e.face.x, y: -e.face.y }; e.t = g.rng.range(0.8, 1.8); }
  },

  wisp(e, g, dt) {
    const p = g.player;
    const d = towards(e.x, e.y, p.x, p.y);
    // Wisps shy away from bright light: they back off near the lantern flame.
    const scared = g.nearLight(e.x, e.y);
    const sp = ENEMY_TYPES.wisp.speed * (scared ? -1.4 : 1);
    e.vx += (d.x * sp - e.vx) * Math.min(1, dt * 2);
    e.vy += (d.y * sp - e.vy) * Math.min(1, dt * 2);
    g.moveEnemy(e, e.vx * dt, e.vy * dt + Math.sin(e.anim * 3) * 6 * dt);
  },

  bigslime(e, g, dt) {
    const p = g.player;
    e.t -= dt;
    if (e.state === 'idle') {
      if (e.t <= 0) { e.state = 'squash'; e.t = 0.55; e.tele = { kind: 'squash' }; }
    } else if (e.state === 'squash') {
      if (e.t <= 0) {
        const d = towards(e.x, e.y, p.x, p.y);
        e.vx = d.x * 70; e.vy = d.y * 70;
        e.state = 'hop'; e.t = 0.6; e.tele = null;
      }
    } else if (e.state === 'hop') {
      g.moveEnemy(e, e.vx * dt, e.vy * dt);
      e.z = Math.sin((1 - e.t / 0.6) * Math.PI) * 12;
      if (e.t <= 0) {
        e.z = 0; e.state = 'idle'; e.t = g.rng.range(0.7, 1.2);
        g.emit({ type: 'thud', x: e.x, y: e.y });
        g.shake(3);
      }
    }
  },

  shellbeetle(e, g, dt) {
    const p = g.player;
    e.t -= dt;
    if (e.state === 'idle' || e.state === 'walk') {
      const d = towards(e.x, e.y, p.x, p.y);
      const ax = Math.abs(d.x) > Math.abs(d.y);
      e.face = ax ? { x: Math.sign(d.x), y: 0 } : { x: 0, y: Math.sign(d.y) };
      g.moveEnemy(e, e.face.x * 26 * dt, e.face.y * 26 * dt);
      const aligned = Math.abs(ax ? p.y - e.y : p.x - e.x) < 12;
      if (e.t <= 0 && aligned) { e.state = 'paw'; e.t = 0.7; e.tele = { kind: 'line', dx: e.face.x, dy: e.face.y }; }
      if (e.t <= -2.5) { e.state = 'paw'; e.t = 0.7; e.tele = { kind: 'line', dx: e.face.x, dy: e.face.y }; }
    } else if (e.state === 'paw') {
      if (e.t <= 0) { e.state = 'charge'; e.t = 2; e.tele = null; g.emit({ type: 'charge', x: e.x, y: e.y }); }
    } else if (e.state === 'charge') {
      const hit = g.moveEnemy(e, e.face.x * 150 * dt, e.face.y * 150 * dt);
      if (hit || e.t <= 0) {
        e.state = 'idle'; e.t = 1.5;
        if (hit) { e.stun = 1.8; g.shake(5); g.emit({ type: 'bonk', x: e.x, y: e.y }); }
      }
    }
  },

  gearknight(e, g, dt) {
    const p = g.player;
    e.t -= dt;
    const d = towards(e.x, e.y, p.x, p.y);
    if (e.state === 'idle') {
      e.face = Math.abs(d.x) > Math.abs(d.y) ? { x: Math.sign(d.x), y: 0 } : { x: 0, y: Math.sign(d.y) };
      g.moveEnemy(e, d.x * 30 * dt, d.y * 30 * dt);
      if (e.t <= 0 && dist(e, p) < 4 * TILE) { e.state = 'windup'; e.t = 0.75; e.tele = { kind: 'glow' }; }
      else if (e.t <= -3) { e.state = 'windup'; e.t = 0.75; e.tele = { kind: 'glow' }; }
    } else if (e.state === 'windup') {
      if (e.t <= 0) { e.state = 'spin'; e.t = 1.6; e.tele = null; e.pierceArmor = true; g.emit({ type: 'spin', x: e.x, y: e.y }); }
    } else if (e.state === 'spin') {
      e.vx += (d.x * 72 - e.vx) * Math.min(1, dt * 2.5);
      e.vy += (d.y * 72 - e.vy) * Math.min(1, dt * 2.5);
      g.moveEnemy(e, e.vx * dt, e.vy * dt);
      if (e.t <= 0) { e.state = 'idle'; e.t = 1.4; e.stun = 1.5; e.vx = e.vy = 0; g.emit({ type: 'dizzy', x: e.x, y: e.y }); }
    }
  },
};

function randomDir(rng) {
  const a = rng() * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** What a defeated enemy leaves behind (null = nothing). Deterministic per rng. */
export function rollDrop(rng, kind, playerHurt) {
  const t = ENEMY_TYPES[kind];
  if (!t || rng() > t.drop) return null;
  if (playerHurt && rng() < 0.45) return 'heart';
  return rng() < 0.18 ? 'berry5' : 'berry';
}
