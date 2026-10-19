// Autopilot: plays the real game through the same controls a player uses.
// Each moment it picks the nearest useful goal (an enemy in a room that needs
// clearing, a chest, a switch, a torch, a block to push, a locked door, a
// cracked rock) and walks there along a tile path, swinging the vine across
// gaps when it has it. Used by the tests to clear a dungeon and as `?autoplay`.
import { TILE, ROOM_W, ROOM_H, ITEM_RANGE, tileDef, isSolid, isFlyable } from './tiles.js';
import { F, roomKey } from './areas.js';
import { grappleLanding, solvePlates } from './solver.js';

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Autopilot {
  constructor() {
    this.path = null;
    this.goal = null;
    this.replan = 0;
    this.stuckT = 0;
    this.last = null;
    this.plan = null; // block pushes for the current plates room
    this.toggle = false;
    this.talkT = 0;
    this.log = [];
  }

  controls(g, dt) {
    const ctl = { x: 0, y: 0, attack: false, item: false, interact: false };
    this.toggle = !this.toggle;
    if (g.mode === 'talk') {
      this.talkT += dt;
      if (this.talkT > 0.15) {
        this.talkT = 0;
        const n = g.talkNode;
        if (n && n.choices) g.talkChoose(0); else g.talkNext();
      }
      return ctl;
    }
    if (g.mode === 'itemget') { ctl.attack = this.toggle; return ctl; }
    if (g.mode === 'dead') { g.respawn(); this.path = null; this.goal = null; return ctl; }
    if (g.mode !== 'play' || g.transition) return ctl;
    const p = g.player;
    if (p.action === 'pull' || p.action === 'dash') return ctl;

    this.replan -= dt;
    // Stuck? Plan again from scratch.
    if (this.last && Math.hypot(this.last.x - p.x, this.last.y - p.y) < 0.3) this.stuckT += dt; else this.stuckT = 0;
    this.last = { x: p.x, y: p.y };
    if (this.stuckT > 1.2) { this.path = null; this.goal = null; this.stuckT = 0; this.wiggle = 0.25; }
    if (this.wiggle > 0) {
      this.wiggle -= dt;
      const a = g.clock * 7;
      return { ...ctl, x: Math.cos(a), y: Math.sin(a) };
    }

    const fight = this.fightTarget(g);
    if (fight) return this.fight(g, fight, ctl, dt);
    const prize = g.pickups.find((k) => !k.dead && !k.carried && (k.kind === 'shard' || k.kind === 'container' || (k.kind === 'heart' && g.player.hp < g.save.maxHearts * 2) || k.kind.startsWith('berry')));
    if (prize && Math.hypot(prize.x - p.x, prize.y - p.y) < 160) {
      return { ...ctl, x: clamp((prize.x - p.x) / 4), y: clamp((prize.y - p.y) / 4) };
    }

    if (!this.goal || this.replan <= 0 || this.goalDone(g)) {
      this.replan = 0.5;
      this.goal = this.chooseGoal(g);
      this.path = this.goal ? this.goal.path : null;
    }
    if (!this.goal) return ctl;
    return this.follow(g, ctl);
  }

  // ------------------------------------------------------------ fighting

  fightTarget(g) {
    const p = g.player;
    const alive = g.enemies.filter((e) => e.alive);
    if (!alive.length) return null;
    const mustClear = g.room.cond === 'clear' || g.room.cond === 'boss';
    let best = null, bd = Infinity;
    for (const e of alive) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (!mustClear && d > 40) continue;
      if (e.kind === 'shade' && !e.revealed) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  fight(g, e, ctl, dt) {
    const p = g.player;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = Math.hypot(dx, dy);
    // Keep away from a boss while it is winding up or in the air.
    const danger = e.boss && (['crouch', 'air', 'puff', 'claw', 'bell'].includes(e.state) || e.tele) && e.stun <= 0;
    if (danger) {
      const away = { x: -dx / (d || 1), y: -dy / (d || 1) };
      if (e.tele && e.tele.kind === 'shadow') { const sx = p.x - e.tele.x, sy = p.y - e.tele.y; const sl = Math.hypot(sx, sy) || 1; away.x = sx / sl; away.y = sy / sl; }
      return { ...ctl, x: away.x, y: away.y };
    }
    if (e.kind === 'bellcrab' && e.stun <= 0) {
      // Stun the crab with the vine first.
      if (g.save.equipped !== 'grapple') g.equip('grapple');
      const ax = Math.abs(dx) < 10 ? 0 : Math.sign(dx);
      if (ax === 0) { p.face = { x: 0, y: Math.sign(dy) || -1 }; return { ...ctl, item: this.toggle }; }
      return { ...ctl, x: ax, y: 0 };
    }
    // Armored: circle around to its back.
    let tx = e.x, ty = e.y;
    if (e.armored && e.stun <= 0 && !e.boss) { tx = e.x - e.face.x * 20; ty = e.y - e.face.y * 20; }
    const reach = e.hw + p.hw + 10;
    const alignedX = Math.abs(dy) < e.hh + 6, alignedY = Math.abs(dx) < e.hw + 6;
    if (d < reach + 4 && (alignedX || alignedY) && p.action !== 'swing') {
      p.face = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
      return { ...ctl, attack: this.toggle };
    }
    const mx = tx - p.x, my = ty - p.y;
    const ml = Math.hypot(mx, my) || 1;
    // Close in along one axis so we end up lined up for a swing.
    if (Math.abs(mx) > Math.abs(my)) return { ...ctl, x: Math.sign(mx), y: Math.abs(my) > 4 ? Math.sign(my) * 0.6 : 0 };
    return { ...ctl, x: Math.abs(mx) > 4 ? Math.sign(mx) * 0.6 : 0, y: my / ml > 0 ? 1 : -1 };
  }

  // ------------------------------------------------------------ planning

  walkable(g) {
    const blocked = new Set();
    for (const r of g.solidRects()) blocked.add(Math.floor(r.y / TILE) * g.area.w + Math.floor(r.x / TILE));
    return (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= g.area.w || ty >= g.area.h) return false;
      const i = ty * g.area.w + tx;
      return !isSolid(g.grid[i]) && !blocked.has(i);
    };
  }

  /** BFS over tiles from the player; returns {dist, prev, how} maps. */
  search(g) {
    const ok = this.walkable(g);
    const p = g.player;
    const start = Math.floor(p.y / TILE) * g.area.w + Math.floor(p.x / TILE);
    const prev = new Map([[start, -1]]);
    const how = new Map();
    const q = [start];
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi];
      const x = i % g.area.w, y = (i - x) / g.area.w;
      for (const [dx, dy] of D4) {
        const n = (y + dy) * g.area.w + x + dx;
        if (!prev.has(n) && ok(x + dx, y + dy)) { prev.set(n, i); q.push(n); }
      }
      if (g.save.items.grapple) {
        const rx = Math.floor(x / ROOM_W), ry = Math.floor(y / ROOM_H);
        for (const [dx, dy] of D4) {
          const land = grappleLanding(g.area, g.grid, x, y, dx, dy, rx, ry);
          if (land !== null && !prev.has(land) && ok(land % g.area.w, Math.floor(land / g.area.w))) {
            prev.set(land, i); how.set(land, { grapple: [dx, dy] }); q.push(land);
          }
        }
      }
    }
    return { prev, how, order: q };
  }

  pathTo(sr, target) {
    if (!sr.prev.has(target)) return null;
    const out = [];
    for (let i = target; i !== -1; i = sr.prev.get(i)) out.push({ i, ...(sr.how.get(i) || {}) });
    return out.reverse();
  }

  chooseGoal(g) {
    const sr = this.search(g);
    const A = g.area, w = A.w;
    const cands = [];
    const around = (idx, act) => {
      const x = idx % w, y = (idx - x) / w;
      for (const [dx, dy] of D4) {
        const s = (y + dy) * w + x + dx;
        if (sr.prev.has(s)) cands.push({ stand: s, face: [-dx, -dy], act, target: idx });
      }
    };
    const solved = (key) => g.flag(F.solved(A.id, key));
    // Chests
    for (const e of A.entities) {
      if (e.type !== 'chest' || g.flag(F.chest(e.uid))) continue;
      if (e.appear && !solved(e.room)) continue;
      around(e.y * w + e.x, 'interact');
    }
    // Room puzzles
    for (const room of A.rooms.values()) {
      if (!room.cond || solved(room.key)) continue;
      for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
        const i = (room.ry * ROOM_H + y) * w + room.rx * ROOM_W + x;
        const d = tileDef(g.grid[i]);
        if (room.cond === 'torches' && d.torch && !(g.room.key === room.key && g.lit.has(i))) around(i, 'interact');
        if (room.cond === 'switch' && d.switch) {
          around(i, 'attack');
          if (g.save.items.boomerang) this.lineStands(g, sr, i, ITEM_RANGE.boomerang, cands, 'boomerang');
        }
      }
      if (room.cond === 'plates' && g.room.key === room.key) {
        const push = this.nextPush(g, sr);
        if (push) cands.push(push);
      } else if (room.cond === 'plates' || room.cond === 'clear' || room.cond === 'boss') {
        // Walk into the room: the local logic takes over there.
        const centre = (room.ry * ROOM_H + 6) * w + room.rx * ROOM_W + 9;
        const spot = this.nearestIn(sr, room, g);
        if (spot !== null && g.room.key !== room.key) cands.push({ stand: spot, act: 'enter', target: centre });
      }
    }
    // The Shade King hides until the torches are lit.
    if (g.enemies.some((e) => e.alive && e.kind === 'shade' && !e.revealed)) {
      for (const i of g.roomTiles((d) => d.torch)) if (!g.lit.has(i)) around(i, 'interact');
    }
    // Locked doors
    for (const link of A.links.values()) {
      if (link.type !== 'locked' && link.type !== 'boss') continue;
      if (g.flag(F.link(link.id))) continue;
      const have = link.type === 'locked' ? (g.save.keys[A.id] || 0) > 0 : !!g.save.bigKeys[A.id];
      if (!have) continue;
      for (const t of link.tiles) around(t, 'push');
    }
    // Cracked rocks
    if (g.save.items.dash) {
      for (let i = 0; i < g.grid.length; i++) if (tileDef(g.grid[i]).crack) around(i, 'dash');
    }
    let best = null, bl = Infinity;
    for (const c of cands) {
      const path = this.pathTo(sr, c.stand);
      if (!path) continue;
      const cost = path.length + (c.act === 'enter' ? 30 : 0);
      if (cost < bl) { bl = cost; best = { ...c, path }; }
    }
    if (best) this.log.push(`${best.act} ${best.target}`);
    return best;
  }

  nearestIn(sr, room, g) {
    for (const i of sr.order) {
      const x = i % g.area.w, y = Math.floor(i / g.area.w);
      if (Math.floor(x / ROOM_W) === room.rx && Math.floor(y / ROOM_H) === room.ry) return i;
    }
    return null;
  }

  lineStands(g, sr, target, range, cands, act) {
    const w = g.area.w;
    const tx = target % w, ty = (target - tx) / w;
    for (const [dx, dy] of D4) {
      for (let k = 1; k <= range; k++) {
        const s = (ty - dy * k) * w + tx - dx * k;
        if (sr.prev.has(s)) { cands.push({ stand: s, face: [dx, dy], act, target }); break; }
        if (!isFlyable(g.grid[s])) break;
      }
    }
  }

  nextPush(g, sr) {
    const A = g.area;
    const blocks = g.blocks.map((b) => b.ty * A.w + b.tx);
    const reach = new Set(sr.order);
    const plan = solvePlates(A, g.grid, g.flags, g.room.rx, g.room.ry, reach, 60000, blocks);
    if (!plan || !plan.length) return null;
    const step = plan[0];
    return { stand: step.from, face: step.dir, act: 'pushblock', target: step.block };
  }

  goalDone(g) {
    const goal = this.goal;
    if (!goal) return true;
    if (goal.done) return true;
    return false;
  }

  // ------------------------------------------------------------ walking

  follow(g, ctl) {
    const p = g.player;
    const w = g.area.w;
    const here = Math.floor(p.y / TILE) * w + Math.floor(p.x / TILE);
    const path = this.path;
    if (!path) { this.goal = null; return ctl; }
    // Drop steps already behind us.
    while (path.length > 1 && path[0].i !== here && path.findIndex((s) => s.i === here) > 0) path.shift();
    const k = path.findIndex((s) => s.i === here);
    if (k > 0) path.splice(0, k);
    const next = path[1];
    if (next) {
      if (next.grapple) {
        // Line up on this tile's centre, face the post, shoot.
        const cx = (here % w) * TILE + 8, cy = Math.floor(here / w) * TILE + 8;
        if (Math.abs(p.x - cx) > 1.5 || Math.abs(p.y - cy) > 1.5) return { ...ctl, x: clamp((cx - p.x) / 4), y: clamp((cy - p.y) / 4) };
        if (g.save.equipped !== 'grapple') g.equip('grapple');
        p.face = { x: next.grapple[0], y: next.grapple[1] };
        this.replan = 0.8;
        return { ...ctl, item: this.toggle };
      }
      const tx = (next.i % w) * TILE + 8, ty = Math.floor(next.i / w) * TILE + 8;
      const dx = tx - p.x, dy = ty - p.y;
      return { ...ctl, x: Math.abs(dx) > 1 ? clamp(dx / 3) : 0, y: Math.abs(dy) > 1 ? clamp(dy / 3) : 0 };
    }
    // At the stand tile: centre up, face, act.
    const goal = this.goal;
    const cx = (here % w) * TILE + 8, cy = Math.floor(here / w) * TILE + 8;
    const pushy = goal.act === 'push' || goal.act === 'pushblock';
    const offX = pushy && goal.face[0] ? 0 : p.x - cx, offY = pushy && goal.face[1] ? 0 : p.y - cy;
    if (goal.act !== 'enter' && (Math.abs(offX) > 2 || Math.abs(offY) > 2)) return { ...ctl, x: clamp(-offX / 3), y: clamp(-offY / 3) };
    if (goal.face) p.face = { x: goal.face[0], y: goal.face[1] };
    switch (goal.act) {
      case 'interact': goal.done = true; this.replan = 0; return { ...ctl, interact: true };
      case 'attack': goal.done = true; return { ...ctl, attack: true };
      case 'boomerang':
        if (g.save.equipped !== 'boomerang') g.equip('boomerang');
        goal.done = true; this.replan = 1.2;
        return { ...ctl, item: true };
      case 'dash':
        if (g.save.equipped !== 'dash') g.equip('dash');
        goal.done = true; this.replan = 0.6;
        return { ...ctl, item: true };
      case 'push':
      case 'pushblock':
        this.replan = Math.min(this.replan, 0.6);
        return { ...ctl, x: goal.face[0], y: goal.face[1] };
      case 'enter': {
        const tx = (goal.target % w) * TILE + 8, ty = Math.floor(goal.target / w) * TILE + 8;
        return { ...ctl, x: clamp((tx - p.x) / 6), y: clamp((ty - p.y) / 6) };
      }
      default:
        return ctl;
    }
  }
}

const clamp = (v) => Math.max(-1, Math.min(1, v));

/** Run the autopilot until `done(game)` or the time limit. Returns seconds used. */
export function runAutopilot(game, { seconds = 600, done = () => false, step = 1 / 60, pilot = new Autopilot() } = {}) {
  let t = 0;
  while (t < seconds) {
    const ctl = pilot.controls(game, step);
    game.step(step, ctl);
    t += step;
    if (done(game)) break;
  }
  return { t, pilot };
}

export { roomKey };
