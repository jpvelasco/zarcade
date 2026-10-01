// The autopilot: plays the title-screen demo and, in the tests, has to clear
// stage 1 on its own (a balance check that the stage is fair).
//
// It never cheats on movement: every few frames it tries a handful of short
// input plans (run, jump now, wait then jump, let go of the vine now or a bit
// later...) through the real `stepPlayer` physics, against the platforms and
// crocs as they will be at that moment, and picks the plan that makes the
// most safe progress without touching anything dangerous. It shoots all the
// time, aiming at whatever is closest.

import { hurtbox, overlaps, stepPlayer, stepVine } from './physics.js';
import { shotHurtBox } from './world.js';
import { bossBox, bossVulnerable } from './bosses.js';
import { isActiveBody } from './enemies.js';
import { TILE, isLadder } from './tiles.js';

const HORIZON = 84;
const REPLAN = 5;

function seq(frames, after = 'right', horizon = HORIZON) {
  return { frames, after, horizon: Math.min(HORIZON, horizon) };
}

function groundPlans(inArena) {
  const plans = [];
  const run = (n) => Array.from({ length: n }, () => ({ right: true }));
  const jump = (hold, dir = 'right', total = 40) => Array.from({ length: total }, (_, i) => ({
    [dir]: dir !== 'none', jump: i < hold, jumpPressed: i === 0,
  }));
  const wait = (n) => Array.from({ length: n }, () => ({}));
  plans.push(seq(run(24), 'right', 32));
  for (const hold of [26, 14, 7, 3]) plans.push(seq(jump(hold)));
  for (const w of [8, 18, 32]) plans.push(seq([...wait(w), ...jump(26)]));
  for (const w of [8, 16]) plans.push(seq([...run(w), ...jump(26)]));
  plans.push(seq(jump(26, 'none', 30)));
  plans.push(seq(wait(24), 'none', 30));
  plans.push(seq(Array.from({ length: 16 }, () => ({ left: true })), 'none', 30));
  if (inArena) {
    plans.push(seq(Array.from({ length: 30 }, () => ({ left: true })), 'none'));
    plans.push(seq(Array.from({ length: 30 }, (_, i) => ({ left: true, jump: i < 26, jumpPressed: i === 0 })), 'none'));
    plans.push(seq(Array.from({ length: 30 }, (_, i) => ({ right: true, jump: i < 26, jumpPressed: i === 0 })), 'none'));
    plans.push(seq(Array.from({ length: 20 }, () => ({ down: true })), 'none'));
    plans.push(seq(run(12), 'none'));
  }
  return plans;
}

function vinePlans() {
  const plans = [];
  for (const w of [0, 4, 9, 15, 22, 30, 40, 52]) {
    const frames = Array.from({ length: w }, () => ({ pump: true }));
    frames.push({ right: true, jump: true, jumpPressed: true });
    for (let i = 0; i < 24; i += 1) frames.push({ right: true, jump: true });
    plans.push(seq(frames));
  }
  return plans;
}

function airPlans() {
  return [
    seq([{ right: true, jump: true }], 'rightHold'),
    seq([{ right: true }]),
    seq([{ jump: true }], 'none'),
    seq([{}], 'none'),
    seq([{ left: true }], 'leftRelease'),
  ];
}

function ladderPlans() {
  return [
    seq(Array.from({ length: 20 }, () => ({ up: true })), 'right'),
    seq([{ right: true, jump: true, jumpPressed: true }], 'right'),
  ];
}

function continuation(kind, frame) {
  switch (kind) {
    case 'right': return { right: true };
    case 'rightHold': return { right: true, jump: true };
    case 'leftRelease': return { left: true };
    default: return {};
  }
}

export class Pilot {
  constructor(playerIndex = 0) {
    this.index = playerIndex;
    this.queue = [];
    this.after = 'right';
    this.timer = 0;
    this.bestX = -Infinity;
    this.stuck = 0;
    this.lastPlan = null;
  }

  /** Controls for this frame. */
  controls(world) {
    const p = world.players[this.index];
    if (!p || p.state !== 'alive' || world.status !== 'play') {
      this.queue.length = 0;
      return {};
    }
    if (p.x > this.bestX + 4) { this.bestX = p.x; this.stuck = 0; }
    else this.stuck += 1;
    if (this.timer <= 0 || this.queue.length === 0) {
      this.plan(world, p);
      this.timer = REPLAN;
    }
    this.timer -= 1;
    const frame = this.queue.length ? this.queue.shift() : continuation(this.after);
    const input = this.expand(frame, p, world);
    return this.aim(input, p, world);
  }

  expand(frame, p, world) {
    if (!frame.pump) return { ...frame };
    // Pump the vine: lean with the swing.
    const v = world.vines[p.vine];
    if (!v) return {};
    return v.omega > 0 ? { right: true } : { left: true };
  }

  plan(world, p) {
    const inArena = !!(world.arena && world.arena.active);
    let plans;
    if (p.mode === 'vine') plans = vinePlans();
    else if (p.mode === 'ladder') plans = ladderPlans();
    else if (p.onGround || p.coyote > 0) plans = groundPlans(inArena);
    else plans = airPlans();
    if (this.stuck > 240 && !inArena) {
      plans.push(seq(Array.from({ length: 40 }, (_, i) => ({ left: i < 20, right: i >= 20, jump: true, jumpPressed: i === 0 || i === 20 }))));
    }

    const envs = [];
    for (let i = 0; i < HORIZON; i += 1) envs.push(world.physicsEnv(world.t + (i + 1) / 60));
    const threats = this.threats(world, p);
    let best = null;
    let bestScore = -Infinity;
    for (const plan of plans) {
      const score = this.simulate(world, p, plan, envs, threats, inArena);
      if (score > bestScore + 0.01) { bestScore = score; best = plan; }
    }
    this.lastPlan = { score: bestScore };
    // Keep the whole plan (a jump's hold stays intact) until the next replan.
    this.queue = best.frames.slice();
    this.after = best.after;
  }

  threats(world, p) {
    const list = [];
    for (const s of world.shots) {
      if (s.dead) continue;
      const box = shotHurtBox(s);
      list.push({ box, vx: s.vx, vy: s.vy, g: s.rolling ? 0 : s.gravity || 0, life: s.life - s.age, from: 0, pad: 3 });
    }
    for (const e of world.enemies) {
      if (!isActiveBody(e) || e.harmless && !p.onGround) continue;
      const box = { x: e.x, y: e.y, w: e.w, h: e.h };
      list.push({ box, vx: e.vx || 0, vy: 0, g: 0, life: 3, from: 0, pad: e.harmless ? 1 : 4 });
    }
    for (const m of world.markers) {
      const tall = m.kind === 'hbeam' ? 0 : m.kind === 'column' ? 120 : 56;
      const box = m.kind === 'hbeam'
        ? { x: m.x, y: m.y - 6, w: m.w, h: 12 }
        : { x: m.x - 4, y: m.y - tall, w: m.w + 8, h: tall + 6 };
      list.push({ box, vx: 0, vy: 0, g: 0, from: Math.max(0, m.life - 0.45), life: m.life + 0.6, pad: 0 });
    }
    const boss = world.boss;
    if (boss && bossVulnerable(boss)) {
      const box = bossBox(boss);
      list.push({ box, vx: 0, vy: 0, g: 0, life: 9, from: 0, pad: 8 });
    }
    return list;
  }

  simulate(world, p0, plan, envs, threats, inArena) {
    const look = world.lookahead(p0);
    const p = look.player;
    const vines = look.vines;
    const startX = p.x;
    let left = false;
    let danger = 0;
    for (let i = 0; i < plan.horizon; i += 1) {
      const raw = i < plan.frames.length ? plan.frames[i] : continuation(plan.after, i);
      let input = raw;
      if (raw.pump) {
        const v = vines[p.vine];
        input = v && v.omega > 0 ? { right: true } : { left: true };
      }
      const env = envs[i];
      env.vines = vines;
      for (const v of vines) if (v.holder < 0) stepVine(v, 1 / 60);
      stepPlayer(p, input, env, 1 / 60);
      if (p.hazard) return -2000 + i;
      const tau = (i + 1) / 60;
      const box = hurtbox(p);
      for (const th of threats) {
        if (tau < th.from || tau > th.life) continue;
        const b = th.box;
        const moved = { x: b.x + th.vx * tau - th.pad, y: b.y + th.vy * tau + 0.5 * th.g * tau * tau - th.pad, w: b.w + th.pad * 2, h: b.h + th.pad * 2 };
        if (overlaps(box, moved)) { danger += 1; break; }
      }
      if (!p.onGround && p.mode === 'run') left = true;
      if (!inArena) {
        if (left && p.onGround && i > 4) break;
        if (p.mode === 'vine' && i > 2 && plan.frames[0] && plan.frames[0].pump === undefined && p0.mode !== 'vine') {
          return (p.x - startX) + 40 - danger * 60;
        }
      }
    }
    if (inArena) return this.arenaScore(world, p, danger);
    let score = p.x - startX - danger * 60;
    if (!p.onGround && p.mode === 'run') score -= 25;
    if (p.onGround && p.onSand) score -= 30;
    if (p.mode === 'ladder' && isLadder(world.tileAt(Math.floor((p.x + p.w / 2) / TILE), Math.floor((p.y + p.h) / TILE)))) score -= 10;
    return score;
  }

  arenaScore(world, p, danger) {
    const boss = world.boss;
    const arena = world.arena;
    let home = arena.x0 + 60;
    if (boss) {
      const bx = boss.x + boss.w / 2;
      const mid = (arena.x0 + arena.x1) / 2;
      home = bx > mid ? Math.max(arena.x0 + 30, bx - 140) : Math.min(arena.x1 - 30, bx + 140);
      if (boss.type === 'idol' || boss.type === 'mothership') home = bx + (bx > mid ? -70 : 70);
    }
    const cx = p.x + p.w / 2;
    return -danger * 400 - Math.abs(cx - home) * 0.6 - (p.onGround ? 0 : 6);
  }

  /** Add aiming (up/down) toward the nearest target without breaking the plan. */
  aim(input, p, world) {
    input.shoot = true;
    const cx = p.x + p.w / 2;
    const cy = p.y + 8;
    let target = null;
    let bestD = 220;
    for (const e of world.enemies) {
      if (!isActiveBody(e) || !e.shootable) continue;
      const dx = e.x + e.w / 2 - cx;
      const dy = e.y + e.h / 2 - cy;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < bestD) { bestD = d; target = { dx, dy }; }
    }
    const boss = world.boss;
    if (boss && bossVulnerable(boss)) {
      const box = bossBox(boss);
      const dx = box.x + box.w / 2 - cx;
      const dy = box.y + box.h / 2 - cy;
      if (!target || Math.abs(dx) + Math.abs(dy) < bestD + 60) target = { dx, dy };
    }
    if (!target || p.mode === 'ladder') return input;
    const onLadderTile = isLadder(world.tileAt(Math.floor(cx / TILE), Math.floor((p.y + p.h - 2) / TILE)));
    const ahead = target.dx * p.facing > 0 || Math.abs(target.dx) < 12;
    // 8-way: diagonal past 22.5 degrees, straight up past 67.5.
    const steep = Math.abs(target.dy) > Math.abs(target.dx) * 0.41;
    if (target.dy < -6 && steep && !onLadderTile && (ahead || Math.abs(target.dx) < 30)) {
      input.up = true;
    } else if (target.dy > 6 && steep && !p.onGround && p.mode === 'run') {
      input.down = true;
    }
    // Turn to face a target behind us when the plan is standing still.
    if (!input.left && !input.right && !ahead && Math.abs(target.dx) > 16 && p.onGround) {
      if (target.dx > 0) input.right = true;
      else input.left = true;
      if (Math.abs(target.dy) < 18) input.up = false;
    }
    if (!input.left && !input.right && Math.abs(target.dx) < 30 && target.dy < -18) input.up = true;
    return input;
  }
}
