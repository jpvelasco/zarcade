// The simulation: Wren, Tumble, rooms, enemies, puzzles, items, quests and
// dialogue. DOM-free, so Node tests (and the autopilot) drive the real game.
// The browser calls `step(dt, controls)` at a fixed rate and reads state.
import { TILE, ROOM_W, ROOM_H, ITEM_RANGE, tileDef, isSolid, isFlyable, isPost, code } from './tiles.js';
import { allAreas, liveGrid, roomKey, F, dungeonDef, dungeonExit } from './areas.js';
import { moveBox, overlaps } from './collide.js';
import { applyHit, knockbackStep, hurtPlayer, heal, towards, HITSTOP, DAMAGE, KNOCKBACK } from './combat.js';
import { makeEnemy, updateEnemy, rollDrop, ENEMY_TYPES } from './enemies.js';
import { makeBoss, updateBoss, bossVulnerable, shadeHitThreshold, BOSS_TYPES } from './bosses.js';
import { questEvent, stageOf } from './quests.js';
import { scriptFor, signScript, hintScript } from './dialogue.js';
import { makeRng } from './rng.js';
import { berryCap, MAX_HEARTS } from './save.js';

export const STEP = 1 / 60;
export const SPEED = 84;            // px/s walking
export const DASH_SPEED = 280;
export const DASH_TIME = 0.3;
export const PULL_SPEED = 230;
export const SWING_TIME = 0.26;
export const SWING_ACTIVE = 0.17;
export const ROOM_SLIDE = 0.55;     // seconds for a screen-to-screen slide
export const DAY_LENGTH = 300;      // seconds for a full day
export const RACE_TIME = 30;
export const ITEMS = ['lantern', 'boomerang', 'grapple', 'dash'];
export const ITEM_INFO = {
  sword: { name: "Grandpa's Sword", text: 'Swing it with Space / J. Cuts grass, bonks switches, shoos slimes.' },
  lantern: { name: 'Lamplighter Lantern', text: 'Toss a little flame to light torches and lamp posts. Shadow wisps hate it!' },
  boomerang: { name: 'Leafarang', text: 'Throw it to bonk far-away switches, stun enemies and fetch glowberries.' },
  grapple: { name: 'Vine Seeds', text: 'Shoot a vine at a wooden post to zip across water and pits.' },
  dash: { name: 'Ember Dash', text: 'A fiery dash that busts cracked rocks and bowls over enemies.' },
  shard: { name: 'Flame Shard', text: 'A warm piece of the Great Lantern!' },
  heart: { name: 'Heart Container', text: 'One more heart, and all your hearts refilled.' },
  key: { name: 'Small Key', text: 'Opens one locked door in this dungeon.' },
  bigkey: { name: 'Big Key', text: 'Opens the big door to the boss!' },
  tea: { name: 'Fairy Tea', text: 'If your hearts run out, it brings you right back.' },
  pouch: { name: 'Big Berry Pouch', text: 'Carry up to 300 glowberries.' },
};

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SOLID_PROPS = new Set(['npc', 'sign', 'chest', 'statue']);

export function nightAmount(time) {
  // 0 at noon-ish, 1 in the middle of the night, smooth at dusk and dawn.
  const t = ((time % 1) + 1) % 1;
  const d = Math.cos((t - 0.5) * Math.PI * 2); // 1 at 0.5 (noon), -1 at 0 (midnight)
  return Math.max(0, Math.min(1, (0.25 - d) / 0.9));
}

// What Tumble says the first time you walk into an unsolved puzzle room.
export const ROOM_TIPS = {
  plates: 'Tumble: That stone plate wants something heavy. Push a block!',
  torches: 'Tumble: So dark! Light every torch with your lantern.',
  switch: 'Tumble: See that switch? Bonk it to open the way.',
  clear: 'Tumble: The doors are shut tight. Beat every baddie!',
};

// What Tumble says a moment after you walk into a boss room.
export const BOSS_TIPS = {
  toad: 'Tumble: Watch his shadow! Bonk him while he wobbles after landing.',
  bellcrab: 'Tumble: That shell clanks! Snag him with your vine seeds first.',
  shade: 'Tumble: He hides in the dark. Light three torches to see him!',
};

export class Game {
  constructor(save, { seed = 1, areas = allAreas() } = {}) {
    this.save = save;
    this.areas = areas;
    this.rng = makeRng(seed);
    this.flags = new Set(save.flags);
    this.events = [];
    this.clock = 0;
    this.mode = 'play'; // play | talk | itemget | fishing | dead | ending
    this.player = {
      x: 0, y: 0, hw: 5, hh: 4, face: { x: 0, y: 1 }, hp: save.hearts, iframes: 0, kb: null,
      action: null, actionT: 0, walk: 0, moving: false, push: { t: 0, dx: 0, dy: 0 }, z: 0,
      hits: new Set(), itemCd: 0, dashDir: null, pullTo: null,
    };
    this.fox = { x: 0, y: 0, trail: [], sit: 0, face: 1 };
    this.enemies = [];
    this.shots = [];      // Wren's thrown things
    this.hostile = [];    // enemy projectiles and shockwaves
    this.pickups = [];
    this.blocks = [];
    this.lit = new Set(); // lit torch tiles in this room
    this.cut = new Map(); // tile -> time cut (for regrowth on re-entry)
    this.rustle = new Map();
    this.talk = null;
    this.itemGet = null;
    this.queue = [];
    this.fishing = null;
    this.race = null;
    this.transition = null;
    this.toast = null;
    this.tips = [];       // Tumble's nudges: shown one after another while playing
    this.hitstop = 0;
    this.shakeT = 0;
    this.shakeMag = 0;
    this.warpArmed = false;
    this.statueCd = 0;
    this.pendingEnding = false;
    this.dirty = false; // something worth saving happened
    const r = save.respawn;
    if (r && !(areas[r.area] && openSpot(areas[r.area], r.x, r.y))) save.respawn = null; // damaged save
    if (save.respawn) this.enterArea(r.area, r.x, r.y);
    else this.enterArea('overworld', areas.overworld.start.x, areas.overworld.start.y);
    // A brand-new adventure: Tumble says where to go and how to ask him.
    if (save.playTime === 0 && stageOf(save.quests, 'main') <= 0 && !this.isDungeon) {
      this.tips.push({ text: 'Tumble: Grandma Wick is waiting in Lantern Plaza, up north!', delay: 2.4, t: 4 });
      this.tips.push({ text: 'Tumble: Stuck? Ask me for a hint with 💬 (or E).', delay: 0.6, t: 3.5 });
    }
  }

  // ------------------------------------------------------------ helpers

  emit(ev) { this.events.push(ev); }
  shake(m) { this.shakeT = 0.25; this.shakeMag = Math.max(this.shakeMag, m); }
  say(text, t = 2.6) { this.toast = { text, t }; }
  flag(f) { return this.flags.has(f); }
  setFlag(f) { if (!this.flags.has(f)) { this.flags.add(f); this.dirty = true; } }

  get isDungeon() { return this.area.kind === 'dungeon'; }
  get roomRect() {
    return { x: this.room.rx * ROOM_W * TILE, y: this.room.ry * ROOM_H * TILE, w: ROOM_W * TILE, h: ROOM_H * TILE };
  }
  roomLeft() { return this.room.rx * ROOM_W * TILE; }

  tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.area.w || ty >= this.area.h) return code('#');
    return this.grid[ty * this.area.w + tx];
  }
  setTile(idx, ch) {
    this.grid[idx] = code(ch);
    this.emit({ type: 'tile', idx });
  }
  idx(tx, ty) { return ty * this.area.w + tx; }
  tileOf(x, y) { return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) }; }

  inRoom(tx, ty) {
    return Math.floor(tx / ROOM_W) === this.room.rx && Math.floor(ty / ROOM_H) === this.room.ry;
  }

  solidRects() {
    const out = [];
    for (const b of this.blocks) out.push(b);
    for (const p of this.props) if (SOLID_PROPS.has(p.type) && this.propVisible(p)) out.push(p.rect);
    return out;
  }

  propVisible(p) {
    if (p.type === 'chest') return !p.appear || this.flag(F.solved(this.area.id, p.room));
    if (p.type === 'npc' && p.id === 'biscuit') return !this.flag('cat:found');
    if (p.type === 'npc' && p.when === 'ended') return !!this.save.ended;
    if (p.type === 'honeycap') return !this.flag(F.pickup(p.uid));
    return true;
  }

  // ------------------------------------------------------------ areas & rooms

  enterArea(areaId, tx, ty) {
    this.area = this.areas[areaId];
    this.save.area = areaId;
    this.grid = liveGrid(this.area, this.flags);
    const p = this.player;
    p.x = tx * TILE + TILE / 2;
    p.y = ty * TILE + TILE / 2;
    p.action = null;
    this.fox.x = p.x - 12; this.fox.y = p.y + 6; this.fox.trail.length = 0;
    this.warpArmed = !tileDef(this.tileAt(tx, ty)).warp;
    const { tx: x, ty: y } = this.tileOf(p.x, p.y);
    this.enterRoom(roomKey(Math.floor(x / ROOM_W), Math.floor(y / ROOM_H)), true);
    this.emit({ type: 'area', area: areaId });
  }

  enterRoom(key, fresh = false) {
    this.room = this.area.rooms.get(key);
    this.enemies = [];
    this.shots = [];
    this.hostile = [];
    this.pickups = [];
    this.player.pullTo = null;
    if (this.player.action === 'pull') this.player.action = null;
    this.props = this.area.entities.filter((e) => e.room === key && e.type !== 'enemy' && e.type !== 'boss' && e.type !== 'block')
      .map((e) => ({ ...e, rect: { x: e.x * TILE + 8, y: e.y * TILE + 8, hw: 7, hh: 7 } }));
    const solved = this.room.cond && this.flag(F.solved(this.area.id, key));
    // Grass grows back and puzzles reset when you come back.
    for (const [idx] of this.cut) this.grid[idx] = this.area.base[idx];
    this.cut.clear();
    this.blocks = this.area.entities.filter((e) => e.type === 'block' && e.room === key)
      .map((e) => ({ x: e.x * TILE + 8, y: e.y * TILE + 8, hw: 8, hh: 8, tx: e.x, ty: e.y, move: null }));
    this.lit.clear();
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
      const i = this.idx(this.room.rx * ROOM_W + x, this.room.ry * ROOM_H + y);
      if (tileDef(this.grid[i]).torch && solved && this.room.cond === 'torches') this.lit.add(i);
    }
    if (!solved || this.room.cond !== 'clear') {
      for (const e of this.area.entities) {
        if (e.room !== key) continue;
        if (e.type === 'enemy') this.enemies.push(makeEnemy(e.kind, e.x * TILE + 8, e.y * TILE + 8, { delay: this.rng() * 0.6 }));
        if (e.type === 'boss' && !solved) {
          const b = makeBoss(e.kind, e.x * TILE + 8, e.y * TILE + 8);
          this.enemies.push(b);
          this.emit({ type: 'boss', kind: e.kind, name: BOSS_TYPES[e.kind].name });
        }
      }
    }
    // A boss's prize waits for you if you walked away from it.
    if (this.room.cond === 'boss' && solved && !this.save.shards.includes(this.area.id)) {
      const b = this.area.entities.find((e) => e.type === 'boss' && e.room === key);
      // The Shade King's heart is given the moment he falls, so only his
      // shard can still be waiting (if the game was left during his speech).
      if (b && b.kind !== 'shade' && !this.flag(`bossheart:${this.area.id}`)) this.spawnPickup('container', b.x * TILE - 6, b.y * TILE + 8);
      if (b) this.spawnPickup('shard', b.x * TILE + 22, b.y * TILE + 8);
    }
    if (this.area.kind === 'overworld' && this.room.region !== 'village' && nightAmount(this.save.time) > 0.55) {
      for (let i = 0; i < 2; i++) {
        const spot = this.randomFloor();
        if (spot) this.enemies.push(makeEnemy('wisp', spot.x, spot.y, { night: true }));
      }
    }
    const disc = (this.save.discovered[this.area.id] ||= []);
    const firstVisit = !disc.includes(key);
    if (firstVisit) { disc.push(key); this.dirty = true; }
    this.emit({ type: 'room', key, fresh, music: this.music() });
    if (fresh || this.area.kind === 'overworld' || this.room.cond === 'boss' || this.room.mini) {
      this.say(this.isDungeon && fresh ? this.area.name : this.room.name, 2);
    }
    const boss = this.room.cond === 'boss' && this.enemies.find((e) => e.boss && e.alive);
    this.tips = this.tips.filter((tip) => !tip.boss);
    if (boss && BOSS_TIPS[boss.kind]) this.tips.push({ text: BOSS_TIPS[boss.kind], delay: 2.6, t: 4, boss: true });
    else if (firstVisit && this.isDungeon && ROOM_TIPS[this.room.cond] && !this.flag(F.solved(this.area.id, key))) {
      this.tips.push({ text: ROOM_TIPS[this.room.cond], delay: 1.2, t: 3.6, boss: true });
    }
  }

  music() {
    if (this.room.cond === 'boss' && !this.flag(F.solved(this.area.id, this.room.key))) return this.room.key && this.area.id === 'peak' ? 'shade' : 'boss';
    if (this.room.mini && !this.flag(F.solved(this.area.id, this.room.key))) return 'boss';
    if (this.area.kind === 'dungeon') return this.area.id;
    return this.room.region === 'meadow' ? 'village' : this.room.region === 'hills' ? 'mountain' : this.room.region;
  }

  randomFloor() {
    const p = this.player;
    for (let n = 0; n < 40; n++) {
      const tx = this.room.rx * ROOM_W + 1 + this.rng.int(ROOM_W - 2);
      const ty = this.room.ry * ROOM_H + 1 + this.rng.int(ROOM_H - 2);
      const x = tx * TILE + 8, y = ty * TILE + 8;
      if (isSolid(this.tileAt(tx, ty)) || Math.hypot(x - p.x, y - p.y) < 64) continue;
      return { x, y };
    }
    return null;
  }

  // ------------------------------------------------------------ step

  step(dt, ctl = {}) {
    this.events.length = 0;
    this.clock += dt;
    this.save.playTime += dt;
    if (this.toast && (this.toast.t -= dt) <= 0) this.toast = null;
    if (this.tips.length && this.mode === 'play' && !this.transition && !this.toast && (this.tips[0].delay -= dt) <= 0) {
      const tip = this.tips.shift();
      this.say(tip.text, tip.t);
    }
    if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeMag = 0; }
    if (this.transition) return this.stepTransition(dt);
    if (this.mode === 'talk' || this.mode === 'dead' || this.mode === 'ending') return;
    if (this.mode === 'itemget') {
      this.itemGet.t -= dt;
      if (this.itemGet.t <= 0 || (this.itemGet.t < this.itemGet.dur - 0.5 && (ctl.attack || ctl.interact))) this.finishItemGet();
      return;
    }
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    if (this.mode === 'fishing') { this.stepFishing(dt, ctl); return; }
    if (this.area.kind === 'overworld') this.save.time = (this.save.time + dt / DAY_LENGTH) % 1;
    if (this.statueCd > 0) this.statueCd -= dt;

    this.stepPlayer(dt, ctl);
    if (this.transition || this.mode !== 'play') return;
    this.stepFox(dt);
    this.stepBlocks(dt);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.boss) updateBoss(e, this, dt); else updateEnemy(e, this, dt);
      const kb = knockbackStep(e.kb, dt);
      if (kb.x || kb.y) this.moveEnemy(e, kb.x * dt, kb.y * dt);
    }
    this.stepShots(dt);
    this.stepHostile(dt);
    this.stepPickups(dt);
    this.checkContact();
    this.checkRoomCondition();
    this.stepRace(dt);
    for (const [i, t] of this.rustle) { if (t - dt <= 0) this.rustle.delete(i); else this.rustle.set(i, t - dt); }
  }

  // ------------------------------------------------------------ player

  playerBlocked() {
    return (tx, ty) => {
      if (!this.inRoom(tx, ty)) {
        // Leaving the room is fine if the neighbour exists and is open here.
        const rk = roomKey(Math.floor(tx / ROOM_W), Math.floor(ty / ROOM_H));
        if (!this.area.rooms.has(rk)) return true;
      }
      return isSolid(this.tileAt(tx, ty));
    };
  }

  stepPlayer(dt, ctl) {
    const p = this.player;
    if (p.iframes > 0) p.iframes -= dt;
    if (p.itemCd > 0) p.itemCd -= dt;
    const blocked = this.playerBlocked();
    const rects = this.solidRects();
    let mx = ctl.x || 0, my = ctl.y || 0;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len < 0.2) { mx = 0; my = 0; }

    if (ctl.cycle) this.cycleItem(1);

    if (p.action === 'dash') return this.stepDash(dt, blocked, rects);
    if (p.action === 'pull') return this.stepPull(dt);

    if (p.action === 'swing') {
      p.actionT += dt;
      if (p.actionT < SWING_ACTIVE) this.swordHits();
      if (p.actionT >= SWING_TIME) p.action = null;
      mx *= 0.25; my *= 0.25;
    } else {
      if (ctl.interact || ctl.attack) {
        const target = this.interactTarget();
        if (target) { this.interact(target); return; }
        if (ctl.attack) this.startSwing();
        else { this.startTalk(hintScript(this.view()), 'tumble'); return; }
      }
      if (ctl.item) this.useItem();
      if (p.action === 'dash' || p.action === 'pull') return;
    }

    // Facing follows the stronger input axis.
    if (mx || my) {
      if (Math.abs(mx) > Math.abs(my) + 0.05) p.face = { x: Math.sign(mx), y: 0 };
      else if (Math.abs(my) > Math.abs(mx) + 0.05) p.face = { x: 0, y: Math.sign(my) };
      else if (p.face.x === 0 && p.face.y === 0) p.face = { x: 0, y: 1 };
    }
    const kb = knockbackStep(p.kb, dt);
    const vx = mx * SPEED + kb.x, vy = my * SPEED + kb.y;
    const hit = moveBox(p, vx * dt, vy * dt, blocked, rects, !kb.x && !kb.y);
    p.moving = !!(mx || my);
    if (p.moving) {
      p.walk += dt;
      this.touchGrass(p.x, p.y);
    } else p.walk = 0;

    // Pressing into something for a moment: push blocks, open doors.
    const pushing = (hit.hitX && mx && !my) || (hit.hitY && my && !mx);
    if (pushing) {
      const dx = hit.hitX ? Math.sign(mx) : 0, dy = hit.hitY ? Math.sign(my) : 0;
      if (p.push.dx !== dx || p.push.dy !== dy) p.push = { t: 0, dx, dy };
      p.push.t += dt;
      this.pressInto(dx, dy, p.push.t);
    } else p.push.t = 0;

    this.checkRoomExit();
    this.checkWarp();
    this.checkTouches();
  }

  cycleItem(dir) {
    const owned = ITEMS.filter((i) => this.save.items[i]);
    if (owned.length < 2) return;
    const i = owned.indexOf(this.save.equipped);
    this.save.equipped = owned[(i + dir + owned.length) % owned.length];
    this.emit({ type: 'equip', item: this.save.equipped });
  }

  equip(item) {
    if (this.save.items[item] && ITEMS.includes(item)) { this.save.equipped = item; this.emit({ type: 'equip', item }); }
  }

  frontTile(dist = 10) {
    const p = this.player;
    return this.tileOf(p.x + p.face.x * dist, p.y + p.face.y * dist);
  }

  pressInto(dx, dy, t) {
    const p = this.player;
    const { tx, ty } = this.tileOf(p.x + dx * (p.hw + 3), p.y + dy * (p.hh + 3));
    const c = this.tileAt(tx, ty);
    const def = tileDef(c);
    if (def.lock && t > 0.12) {
      const idx = this.idx(tx, ty);
      const linkId = this.area.tileLink.get(idx);
      if (!linkId) return;
      const ok = def.lock === 'key' ? (this.save.keys[this.area.id] || 0) > 0 : !!this.save.bigKeys[this.area.id];
      if (!ok) {
        if (t < 0.14) this.say(def.lock === 'key' ? 'Locked. You need a small key.' : 'A big lock! You need the Big Key.');
        return;
      }
      if (def.lock === 'key') this.save.keys[this.area.id] -= 1;
      this.openLink(linkId);
      return;
    }
    if (t > 0.3) {
      const b = this.blocks.find((bl) => !bl.move && Math.abs(bl.x - (p.x + dx * 12)) < 10 && Math.abs(bl.y - (p.y + dy * 12)) < 10);
      if (b) this.tryPushBlock(b, dx, dy);
    }
  }

  openLink(linkId) {
    const link = this.area.links.get(linkId);
    this.setFlag(F.link(linkId));
    for (const t of link.tiles) this.setTile(t, '.');
    this.emit({ type: 'unlock', x: this.player.x, y: this.player.y, boss: link.type === 'boss' });
    this.dirty = true;
  }

  tryPushBlock(b, dx, dy) {
    const nx = b.tx + dx, ny = b.ty + dy;
    const c = this.tileAt(nx, ny);
    const rx = nx - this.room.rx * ROOM_W, ry = ny - this.room.ry * ROOM_H;
    if (rx < 1 || ry < 1 || rx > ROOM_W - 2 || ry > ROOM_H - 2) return;
    if (isSolid(c) || tileDef(c).warp) return;
    if (this.blocks.some((o) => o !== b && o.tx === nx && o.ty === ny)) return;
    if (this.props.some((pr) => SOLID_PROPS.has(pr.type) && this.propVisible(pr) && pr.x === nx && pr.y === ny)) return;
    b.move = { fx: b.x, fy: b.y, t: 0 };
    b.tx = nx; b.ty = ny;
    this.player.push.t = 0;
    this.emit({ type: 'push', x: b.x, y: b.y });
  }

  stepBlocks(dt) {
    for (const b of this.blocks) {
      if (!b.move) continue;
      b.move.t += dt / 0.22;
      const k = Math.min(1, b.move.t);
      const tx = b.tx * TILE + 8, ty = b.ty * TILE + 8;
      b.x = b.move.fx + (tx - b.move.fx) * k;
      b.y = b.move.fy + (ty - b.move.fy) * k;
      if (k >= 1) {
        b.move = null;
        if (tileDef(this.tileAt(b.tx, b.ty)).plate) this.emit({ type: 'plate', x: b.x, y: b.y });
      }
    }
  }

  startSwing() {
    const p = this.player;
    p.action = 'swing';
    p.actionT = 0;
    p.hits.clear();
    p.switchHit = false;
    this.emit({ type: 'swing', x: p.x, y: p.y, face: p.face });
  }

  swordRect() {
    const p = this.player;
    const along = 12, across = 11;
    if (p.face.x) return { x: p.x + p.face.x * (p.hw + along / 2 + 1), y: p.y - 2, hw: along / 2 + 1, hh: across };
    return { x: p.x, y: p.y + p.face.y * (p.hh + along / 2 + 1) - 2, hw: across, hh: along / 2 + 1 };
  }

  swordHits() {
    const p = this.player;
    const r = this.swordRect();
    for (const e of this.enemies) {
      if (!e.alive || p.hits.has(e) || !boxHit(r, e)) continue;
      p.hits.add(e);
      this.damageEnemy(e, DAMAGE.sword, p.x, p.y, 'sword');
    }
    for (const h of this.hostile) {
      if (h.breakable && !h.dead && Math.abs(h.x - r.x) < r.hw + h.r && Math.abs(h.y - r.y) < r.hh + h.r) {
        h.dead = true;
        this.emit({ type: 'poof', x: h.x, y: h.y, small: true });
      }
    }
    // Tiles under the blade: cut grass and bushes, bonk switches.
    const x0 = Math.floor((r.x - r.hw) / TILE), x1 = Math.floor((r.x + r.hw) / TILE);
    const y0 = Math.floor((r.y - r.hh) / TILE), y1 = Math.floor((r.y + r.hh) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!this.inRoom(tx, ty)) continue;
      const c = this.tileAt(tx, ty);
      const d = tileDef(c);
      if (d.cut) this.cutTile(tx, ty, d);
      if (d.switch && !p.switchHit) { p.switchHit = true; this.hitSwitch(tx, ty); }
    }
  }

  cutTile(tx, ty, d) {
    const i = this.idx(tx, ty);
    this.cut.set(i, this.clock);
    this.setTile(i, d.cut);
    this.emit({ type: 'cut', x: tx * TILE + 8, y: ty * TILE + 8, bush: !d.grass, region: this.room.region });
    const r = this.rng();
    if (r < 0.12) this.spawnPickup('berry', tx * TILE + 8, ty * TILE + 8);
    else if (r < 0.17 && this.save.hearts < this.save.maxHearts * 2) this.spawnPickup('heart', tx * TILE + 8, ty * TILE + 8);
  }

  touchGrass(x, y) {
    const { tx, ty } = this.tileOf(x, y);
    const i = this.idx(tx, ty);
    if (tileDef(this.tileAt(tx, ty)).grass && !this.rustle.has(i)) {
      this.rustle.set(i, 0.5);
      this.emit({ type: 'rustle', x: tx * TILE + 8, y: ty * TILE + 8 });
    }
  }

  hitSwitch(tx, ty) {
    this.emit({ type: 'switch', x: tx * TILE + 8, y: ty * TILE + 8 });
    const key = roomKey(Math.floor(tx / ROOM_W), Math.floor(ty / ROOM_H));
    const room = this.area.rooms.get(key);
    if (room && room.cond === 'switch' && !this.flag(F.solved(this.area.id, key))) this.solveRoom(key);
  }

  useItem() {
    const p = this.player;
    const item = this.save.equipped;
    if (!this.save.items[item] || p.itemCd > 0) return;
    const fx = p.face.x, fy = p.face.y;
    if (item === 'lantern') {
      p.itemCd = 0.38;
      this.shots.push({ kind: 'ember', x: p.x + fx * 6, y: p.y + fy * 6 - 3, vx: fx * 170, vy: fy * 170, life: ITEM_RANGE.ember * TILE / 170 + 0.05, r: 3 });
      this.emit({ type: 'ember', x: p.x, y: p.y });
    } else if (item === 'boomerang') {
      if (this.shots.some((s) => s.kind === 'boomerang')) return;
      p.itemCd = 0.2;
      this.shots.push({ kind: 'boomerang', x: p.x, y: p.y - 3, vx: fx * 210, vy: fy * 210, out: ITEM_RANGE.boomerang * TILE, back: false, r: 5, carry: [], hit: new Set(), spin: 0 });
      this.emit({ type: 'boomerang', x: p.x, y: p.y });
    } else if (item === 'grapple') {
      if (this.shots.some((s) => s.kind === 'vine')) return;
      p.itemCd = 0.3;
      this.shots.push({ kind: 'vine', x: p.x, y: p.y - 2, ox: p.x, oy: p.y - 2, vx: fx * 300, vy: fy * 300, len: 0, max: ITEM_RANGE.grapple * TILE + 8, back: false, r: 3 });
      this.emit({ type: 'vine', x: p.x, y: p.y });
    } else if (item === 'dash') {
      p.itemCd = 0.55;
      p.action = 'dash';
      p.actionT = 0;
      p.dashDir = { x: fx, y: fy };
      p.hits.clear();
      this.emit({ type: 'dash', x: p.x, y: p.y });
    }
  }

  stepDash(dt, blocked, rects) {
    const p = this.player;
    p.actionT += dt;
    const d = p.dashDir;
    const hit = moveBox(p, d.x * DASH_SPEED * dt, d.y * DASH_SPEED * dt, blocked, rects, true);
    this.emit({ type: 'trail', x: p.x, y: p.y });
    for (const e of this.enemies) {
      if (e.alive && !p.hits.has(e) && boxHit(p, e, 4)) { p.hits.add(e); this.damageEnemy(e, DAMAGE.dash, p.x - d.x * 10, p.y - d.y * 10, 'dash'); }
    }
    if (hit.hitX || hit.hitY) {
      const { tx, ty } = this.tileOf(p.x + d.x * (p.hw + 3), p.y + d.y * (p.hh + 3));
      const c = this.tileAt(tx, ty);
      if (tileDef(c).crack) this.breakCrack(tx, ty);
      else this.shake(2);
      p.action = null;
      p.kb = { x: -d.x * 80, y: -d.y * 80, t: 0.12 };
      this.emit({ type: 'bump', x: p.x, y: p.y });
    }
    if (p.actionT >= DASH_TIME) p.action = null;
    this.checkRoomExit();
  }

  breakCrack(tx, ty) {
    const i = this.idx(tx, ty);
    this.setFlag(F.crack(this.area.id, i));
    this.setTile(i, '.');
    this.shake(5);
    this.hitstop = HITSTOP.heavy;
    this.emit({ type: 'crack', x: tx * TILE + 8, y: ty * TILE + 8 });
    this.emit({ type: 'secret' });
    // Cracked rocks come in pairs in doorways: break the neighbour too.
    for (const [dx, dy] of D4) {
      const n = this.idx(tx + dx, ty + dy);
      if (this.inRoom(tx + dx, ty + dy) && tileDef(this.grid[n]).crack && Math.abs(dx) !== Math.abs(this.player.dashDir?.x || 0)) {
        this.setFlag(F.crack(this.area.id, n));
        this.setTile(n, '.');
        this.emit({ type: 'crack', x: (tx + dx) * TILE + 8, y: (ty + dy) * TILE + 8 });
      }
    }
  }

  stepPull(dt) {
    const p = this.player;
    const t = p.pullTo;
    const dx = t.x - p.x, dy = t.y - p.y;
    const dist = Math.hypot(dx, dy);
    const s = PULL_SPEED * dt;
    if (dist <= s) {
      p.x = t.x; p.y = t.y;
      p.action = null; p.pullTo = null;
      this.shots = this.shots.filter((sh) => sh.kind !== 'vine');
      this.emit({ type: 'land', x: p.x, y: p.y });
    } else {
      p.x += (dx / dist) * s; p.y += (dy / dist) * s;
      const v = this.shots.find((sh) => sh.kind === 'vine');
      if (v) { v.ox = p.x; v.oy = p.y - 2; }
    }
  }

  // ------------------------------------------------------------ interacting

  interactTarget() {
    const p = this.player;
    const fx = p.x + p.face.x * 12, fy = p.y + p.face.y * 12;
    let best = null, bestD = 15;
    for (const pr of this.props) {
      if (!this.propVisible(pr)) continue;
      if (!['npc', 'sign', 'chest', 'statue', 'fishspot'].includes(pr.type)) continue;
      if (pr.type === 'chest' && this.flag(F.chest(pr.uid))) continue;
      const d = Math.hypot(pr.rect.x - fx, pr.rect.y - fy);
      if (d < bestD) { best = pr; bestD = d; }
    }
    if (best) return best;
    const { tx, ty } = this.tileOf(fx, fy);
    const d = tileDef(this.tileAt(tx, ty));
    const i = this.idx(tx, ty);
    if (d.torch && !this.lit.has(i)) return { type: 'torch', tx, ty };
    if (d.lamp && !this.flag(F.lamp(i))) return { type: 'lamp', tx, ty };
    return null;
  }

  interact(t) {
    const p = this.player;
    if (t.type === 'npc') {
      if (t.rect.x < p.x - 2) p.face = Math.abs(t.rect.x - p.x) > Math.abs(t.rect.y - p.y) ? { x: -1, y: 0 } : p.face;
      this.startTalk(scriptFor(t.id, this.view()), t.id);
    } else if (t.type === 'sign') this.startTalk(signScript(t.text), 'sign');
    else if (t.type === 'chest') this.openChest(t);
    else if (t.type === 'statue') this.checkpoint(t, true);
    else if (t.type === 'fishspot') this.startFishing();
    else if (t.type === 'torch') this.lightTorch(t.tx, t.ty);
    else if (t.type === 'lamp') this.lightLamp(t.tx, t.ty);
  }

  view() {
    const s = this.save;
    return {
      stage: (id) => stageOf(s.quests, id),
      count: (id) => (s.quests[id] ? s.quests[id].count : 0),
      has: (item) => !!s.items[item],
      flag: (f) => this.flag(f),
      berries: s.berries, pouch: s.pouch, tea: s.tea, shards: s.shards.length,
      raceTime: RACE_TIME,
      dark: !!this.room.dark,
    };
  }

  openChest(c) {
    this.setFlag(F.chest(c.uid));
    this.save.stats.chests++;
    this.emit({ type: 'chest', x: c.rect.x, y: c.rect.y, big: !!c.big });
    this.giveContents(c.contents, true);
    this.dirty = true;
  }

  giveContents(contents, fromChest = false) {
    const [what, n] = contents.split(':');
    const s = this.save;
    if (what === 'berries') {
      this.addBerries(Number(n) || 0);
      if (fromChest) this.showItem('berries', `${n} glowberries!`, `A pile of ${n} glowberries.`);
      return;
    }
    if (what === 'key') { s.keys[this.area.id] = (s.keys[this.area.id] || 0) + 1; this.showItem('key'); return; }
    if (what === 'bigkey') { s.bigKeys[this.area.id] = true; this.showItem('bigkey'); return; }
    if (what === 'heart') { this.addHeart(); return; }
    if (what === 'tea') { s.tea = 1; this.showItem('tea'); return; }
    if (what === 'pouch') { s.pouch = true; this.showItem('pouch'); return; }
    if (ITEMS.includes(what) || what === 'sword') {
      s.items[what] = true;
      s.equipped = what === 'sword' ? s.equipped : what;
      this.showItem(what);
      this.emit({ type: 'equip', item: s.equipped });
    }
  }

  addBerries(n) {
    this.save.berries = Math.min(berryCap(this.save), this.save.berries + n);
  }

  addHeart() {
    const s = this.save;
    s.maxHearts = Math.min(MAX_HEARTS, s.maxHearts + 1);
    s.hearts = s.maxHearts * 2;
    this.player.hp = s.hearts;
    this.showItem('heart');
  }

  showItem(item, name, text) {
    const info = ITEM_INFO[item] || {};
    const get = { item, name: name || info.name || item, text: text || info.text || '', t: 2.2, dur: 2.2 };
    if (this.mode === 'talk' || this.mode === 'itemget') { this.queue.push(get); return; }
    this.itemGet = get;
    this.mode = 'itemget';
    this.player.action = null;
    this.emit({ type: 'itemget', item, big: ['boomerang', 'grapple', 'dash', 'shard', 'heart', 'bigkey'].includes(item) });
    this.dirty = true;
  }

  finishItemGet() {
    const done = this.itemGet;
    this.itemGet = null;
    this.mode = 'play';
    if (this.queue.length) { const next = this.queue.shift(); this.showItem(next.item, next.name, next.text); return; }
    if (done && done.then) done.then();
    if (this.afterItems) { const f = this.afterItems; this.afterItems = null; f(); }
  }

  checkpoint(statue, talked = false) {
    const s = this.save;
    s.respawn = { area: this.area.id, x: statue.x, y: statue.y + 1 };
    heal(s, 99);
    this.player.hp = s.hearts;
    this.statueCd = 3;
    this.dirty = true;
    this.emit({ type: 'checkpoint', x: statue.rect.x, y: statue.rect.y });
    this.emit({ type: 'save' });
    this.say(talked ? 'Lantern statue: progress saved and hearts refilled!' : 'Checkpoint! Progress saved.');
  }

  lightTorch(tx, ty) {
    const i = this.idx(tx, ty);
    if (this.lit.has(i)) return;
    this.lit.add(i);
    this.emit({ type: 'torch', x: tx * TILE + 8, y: ty * TILE + 8 });
  }

  lightLamp(tx, ty) {
    const i = this.idx(tx, ty);
    if (this.flag(F.lamp(i))) return;
    this.setFlag(F.lamp(i));
    this.emit({ type: 'torch', x: tx * TILE + 8, y: ty * TILE + 8, lamp: true });
    this.questEvent('lamp');
    const st = this.save.quests.lamps;
    this.say(`Lamp post lit! (${Math.min(5, st.count)}/5)`);
    this.dirty = true;
  }

  litCount() { return this.lit.size; }
  pickLitTorch() { const arr = [...this.lit]; return arr.length ? arr[this.rng.int(arr.length)] : null; }
  snuffTorch(i) {
    if (!this.lit.delete(i)) return;
    this.emit({ type: 'snuff', x: (i % this.area.w) * TILE + 8, y: Math.floor(i / this.area.w) * TILE + 8 });
  }
  snuffAll() { for (const i of [...this.lit]) this.snuffTorch(i); }

  nearLight(x, y) {
    for (const s of this.shots) if (s.kind === 'ember' && Math.hypot(s.x - x, s.y - y) < 34) return true;
    for (const i of this.lit) {
      const tx = (i % this.area.w) * TILE + 8, ty = Math.floor(i / this.area.w) * TILE + 8;
      if (Math.hypot(tx - x, ty - y) < 28) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ dialogue

  startTalk(script, npc) {
    this.talk = { script, npc, node: null };
    this.mode = 'talk';
    this.player.action = null;
    this.enterNode(script.start);
  }

  get talkNode() { return this.talk ? this.talk.script.nodes[this.talk.node] : null; }

  enterNode(id) {
    if (!id || !this.talk.script.nodes[id]) return this.endTalk();
    this.talk.node = id;
    const n = this.talk.script.nodes[id];
    for (const e of n.effects || []) this.runEffect(e);
    this.emit({ type: 'talk', who: n.who });
  }

  talkNext() {
    const n = this.talkNode;
    if (!n || n.choices) return;
    this.enterNode(n.next);
  }

  talkChoose(i) {
    const n = this.talkNode;
    if (!n || !n.choices || !n.choices[i]) return;
    const c = n.choices[i];
    let ok = true;
    for (const e of c.effects || []) if (this.runEffect(e) === false) ok = false;
    this.emit({ type: 'choose' });
    this.enterNode(ok ? c.next : (c.fail || c.next));
  }

  endTalk() {
    if (!this.talk) return;
    this.talk = null;
    this.mode = 'play';
    if (this.queue.length) { const next = this.queue.shift(); this.showItem(next.item, next.name, next.text); }
    if (this.pendingEnding && this.mode === 'play') this.startEnding();
    else if (this.pendingEnding) this.afterItems = () => this.startEnding();
  }

  runEffect(effect) {
    const [kind, ...rest] = effect.split(':');
    const arg = rest.join(':');
    if (kind === 'event') {
      if (arg.startsWith('shard:')) this.giveShard(arg.slice(6));
      else this.questEvent(arg);
      return true;
    }
    if (kind === 'flag') { this.setFlag(arg); return true; }
    if (kind === 'heal') { heal(this.save, 99); this.player.hp = this.save.hearts; this.emit({ type: 'heal' }); return true; }
    if (kind === 'race') { this.race = { t: RACE_TIME }; this.say('Go go go! Reach the flag in Mosswood North!'); this.emit({ type: 'race' }); return true; }
    if (kind === 'ending') { this.pendingEnding = true; return true; }
    if (kind === 'buy') {
      const [item, price] = rest;
      const cost = Number(price);
      const s = this.save;
      if (s.berries < cost) return false;
      if (item === 'tea' && s.tea > 0) return false;
      if (item === 'pouch' && s.pouch) return false;
      if (item === 'snack' && s.hearts >= s.maxHearts * 2) return false;
      s.berries -= cost;
      if (item === 'tea') s.tea = 1;
      if (item === 'pouch') s.pouch = true;
      if (item === 'snack') { heal(s, 4); this.player.hp = s.hearts; }
      this.emit({ type: 'buy' });
      this.dirty = true;
      return true;
    }
    return true;
  }

  questEvent(event, quiet = false) {
    const { changed, rewards } = questEvent(this.save.quests, event);
    for (const r of rewards) this.giveContents(r);
    if (changed.length) {
      this.dirty = true;
      if (!quiet || rewards.length) this.emit({ type: 'quest', ids: changed });
      else this.emit({ type: 'quest', ids: changed, quiet: true });
    }
    return changed;
  }

  giveShard(areaId) {
    if (this.save.shards.includes(areaId)) return;
    this.save.shards.push(areaId);
    this.setFlag(`boss:${areaId}`);
    this.questEvent(`shard:${areaId}`);
    this.showItem('shard', `Flame Shard ${this.save.shards.length} of 3`, 'A warm piece of the Great Lantern! It glows in your satchel.');
    this.leaveDungeonAfterItems();
  }

  leaveDungeonAfterItems() {
    if (!this.isDungeon) return;
    this.afterItems = () => {
      const ex = dungeonExit(this.area.id);
      this.warpTo(ex.area, ex.x, ex.y, true);
    };
  }

  startEnding() {
    this.pendingEnding = false;
    this.save.ended = true;
    this.mode = 'ending';
    this.dirty = true;
    this.emit({ type: 'ending' });
  }

  // ------------------------------------------------------------ fishing & race

  startFishing() {
    if (stageOf(this.save.quests, 'fish') < 0) {
      this.startTalk(signScript("Gill's fishing spot. Ask Gill for the spare rod first!"), 'sign');
      return;
    }
    this.mode = 'fishing';
    this.player.face = { x: -1, y: 0 };
    this.fishing = { phase: 'wait', t: this.rng.range(1.2, 3.6), caught: 0 };
    this.emit({ type: 'cast' });
  }

  stepFishing(dt, ctl) {
    const f = this.fishing;
    const press = ctl.attack || ctl.interact;
    f.t -= dt;
    if (f.phase === 'wait') {
      if (press) { f.phase = 'miss'; f.t = 1; this.say('Too early! The fish swam off.'); }
      else if (f.t <= 0) { f.phase = 'bite'; f.t = 0.75; this.emit({ type: 'bite' }); }
      if (Math.hypot(ctl.x || 0, ctl.y || 0) > 0.5) this.stopFishing();
    } else if (f.phase === 'bite') {
      if (press) {
        f.phase = 'caught'; f.t = 1.3;
        this.save.stats.fish++;
        this.questEvent('fish:catch');
        const c = this.save.quests.fish.count;
        this.say(stageOf(this.save.quests, 'fish') >= 1 && c <= 3 ? `You caught a fish! (${Math.min(3, c)}/3)` : 'You caught a fish!');
        this.addBerries(2);
        this.emit({ type: 'catch' });
      } else if (f.t <= 0) { f.phase = 'miss'; f.t = 1; this.say('It got away! Strike when the bobber dips.'); }
    } else if (f.t <= 0) this.stopFishing();
  }

  stopFishing() {
    this.fishing = null;
    this.mode = 'play';
  }

  stepRace(dt) {
    if (!this.race) return;
    this.race.t -= dt;
    if (this.race.t <= 0) {
      this.race = null;
      this.questEvent('race:lose');
      this.say('Hazel wins this time! Talk to her to race again.', 3.5);
      this.emit({ type: 'racelose' });
    }
  }

  // ------------------------------------------------------------ moving between rooms

  checkRoomExit() {
    const p = this.player;
    const { tx, ty } = this.tileOf(p.x, p.y);
    if (this.inRoom(tx, ty)) return;
    const rx = Math.floor(tx / ROOM_W), ry = Math.floor(ty / ROOM_H);
    const key = roomKey(rx, ry);
    if (!this.area.rooms.has(key)) return;
    const dx = rx - this.room.rx, dy = ry - this.room.ry;
    // Step a little further in so you don't land on the edge.
    p.x += dx * 10; p.y += dy * 12;
    p.action = null;
    this.transition = { kind: 'slide', from: this.room.key, to: key, dx, dy, t: 0, dur: ROOM_SLIDE };
    this.emit({ type: 'slide', dx, dy });
  }

  warpTo(areaId, tx, ty, fromBoss = false) {
    this.transition = {
      kind: 'fade', t: 0, dur: fromBoss ? 1.4 : 0.9, swapped: false,
      swap: () => {
        this.enterArea(areaId, tx, ty);
        if (areaId !== 'overworld') this.save.respawn = { area: areaId, x: tx, y: ty };
        else this.save.respawn = { area: 'overworld', x: tx, y: ty };
        this.dirty = true;
        this.emit({ type: 'save' });
      },
    };
    this.emit({ type: 'warp' });
  }

  checkWarp() {
    const p = this.player;
    const { tx, ty } = this.tileOf(p.x, p.y);
    const onWarp = tileDef(this.tileAt(tx, ty)).warp;
    if (!onWarp) { this.warpArmed = true; return; }
    if (!this.warpArmed) return;
    this.warpArmed = false;
    if (this.area.kind === 'overworld') {
      const w = this.props.find((e) => e.type === 'warp' && e.x === tx && e.y === ty);
      if (!w) return;
      const d = this.areas[w.to];
      this.warpTo(w.to, d.start.x, d.start.y);
    } else {
      const ex = dungeonExit(this.area.id);
      this.warpTo(ex.area, ex.x, ex.y);
    }
  }

  stepTransition(dt) {
    const t = this.transition;
    t.t += dt;
    if (t.kind === 'fade') {
      if (!t.swapped && t.t >= t.dur / 2) { t.swapped = true; t.swap(); }
      if (t.t >= t.dur) this.transition = null;
      return;
    }
    if (t.t >= t.dur) {
      this.transition = null;
      this.enterRoom(t.to);
      const p = this.player;
      this.fox.x = p.x - p.face.x * 14; this.fox.y = p.y - p.face.y * 14; this.fox.trail.length = 0;
    }
  }

  checkTouches() {
    const p = this.player;
    for (const pr of this.props) {
      if (!this.propVisible(pr)) continue;
      const d = Math.hypot(pr.rect.x - p.x, pr.rect.y - p.y);
      if (pr.type === 'statue' && d < 22 && this.statueCd <= 0) {
        const r = this.save.respawn;
        if (!r || r.area !== this.area.id || r.x !== pr.x || r.y !== pr.y + 1) this.checkpoint(pr, false);
        else this.statueCd = 1;
      } else if (pr.type === 'honeycap' && d < 12) {
        this.setFlag(F.pickup(pr.uid));
        this.questEvent('honeycap');
        const c = this.save.quests.honey.count;
        this.say(`A golden honeycap! (${Math.min(3, c)}/3)`);
        this.emit({ type: 'pickup', kind: 'honeycap', x: pr.rect.x, y: pr.rect.y });
      } else if (pr.type === 'flag' && d < 14 && this.race) {
        this.race = null;
        this.questEvent('race:win');
        this.say('You beat Hazel to the flag!', 3);
        this.emit({ type: 'racewin' });
      }
    }
  }

  // ------------------------------------------------------------ Tumble the fox

  stepFox(dt) {
    const p = this.player, f = this.fox;
    const lastT = f.trail[f.trail.length - 1];
    if (!lastT || Math.hypot(lastT.x - p.x, lastT.y - p.y) > 1.5) {
      f.trail.push({ x: p.x, y: p.y });
      if (f.trail.length > 14) f.trail.shift();
      f.sit = 0;
    } else f.sit += dt;
    const target = f.trail.length > 10 ? f.trail[0] : null;
    if (target && Math.hypot(target.x - p.x, target.y - p.y) > 12) {
      const dx = target.x - f.x, dy = target.y - f.y;
      f.x += dx * Math.min(1, dt * 7);
      f.y += dy * Math.min(1, dt * 7);
      if (Math.abs(dx) > 0.5) f.face = Math.sign(dx);
    }
  }

  // ------------------------------------------------------------ enemies

  moveEnemy(e, dx, dy, free = false) {
    const rr = this.roomRect;
    const margin = TILE;
    const blocked = (tx, ty) => {
      if (!this.inRoom(tx, ty)) return true;
      const lx = tx - this.room.rx * ROOM_W, ly = ty - this.room.ry * ROOM_H;
      if (lx < 1 || ly < 1 || lx > ROOM_W - 2 || ly > ROOM_H - 2) return true;
      if (free) return false;
      const c = this.tileAt(tx, ty);
      if (e.fly) return !isFlyable(c);
      return isSolid(c) || tileDef(c).warp;
    };
    const before = { x: e.x, y: e.y };
    const hit = moveBox(e, dx, dy, blocked, free ? null : this.blocks, false);
    e.x = Math.max(rr.x + margin + e.hw, Math.min(rr.x + rr.w - margin - e.hw, e.x));
    e.y = Math.max(rr.y + margin + e.hh, Math.min(rr.y + rr.h - margin - e.hh, e.y));
    return hit.hitX || hit.hitY || (before.x === e.x && before.y === e.y && (dx || dy));
  }

  spawnHostile(h) { this.hostile.push({ life: 3, ...h }); }

  damageEnemy(e, amount, fromX, fromY, source) {
    if (e.boss && !bossVulnerable(e)) {
      if (e.iframes <= 0) { e.iframes = 0.2; this.emit({ type: 'clank', x: e.x, y: e.y, ghost: e.kind === 'shade' }); }
      return 'immune';
    }
    if (e.kind === 'wisp' && source === 'ember') amount = 4;
    const before = e.hp;
    const res = applyHit(e, amount, fromX, fromY, { pierce: source === 'dash' && !e.boss, iframes: e.boss ? 0.5 : undefined });
    // A stunned crab soon shakes it off once you start bonking it.
    if (e.kind === 'bellcrab' && (res === 'hit' || res === 'defeated')) e.stun = Math.min(e.stun, 0.8);
    if (res === 'blocked') {
      this.emit({ type: 'clank', x: e.x, y: e.y });
      const d = towards(e.x, e.y, this.player.x, this.player.y);
      this.player.kb = { x: d.x * 120, y: d.y * 120, t: 0.12 };
      this.hitstop = HITSTOP.hit;
      return res;
    }
    if (res === 'immune') return res;
    this.hitstop = e.boss ? HITSTOP.heavy : HITSTOP.hit;
    this.emit({ type: 'hit', x: e.x, y: e.y, kind: e.kind, boss: !!e.boss });
    if (e.kind === 'shade' && shadeHitThreshold(e, before)) {
      this.snuffAll();
      e.revealed = false;
      this.say('The Shade King blew out the torches! Light them again!');
    }
    if (res === 'defeated') this.defeat(e);
    return res;
  }

  defeat(e) {
    e.alive = false;
    this.save.stats.defeated++;
    this.emit({ type: 'poof', x: e.x, y: e.y, kind: e.kind, big: !!(e.boss || e.mini) });
    if (e.kind === 'bigslime') {
      for (const s of [-1, 1]) this.enemies.push(makeEnemy('slime', e.x + s * 10, e.y, { delay: 0.3, kb: { x: s * 120, y: 0, t: 0.16 } }));
    }
    if (e.boss) return this.bossDefeated(e);
    const drop = rollDrop(this.rng, e.kind, this.save.hearts < this.save.maxHearts * 2);
    if (drop) this.spawnPickup(drop, e.x, e.y);
    if (e.mini) this.shake(4);
  }

  bossDefeated(b) {
    this.hitstop = 0.35;
    this.shake(8);
    this.hostile = [];
    this.solveRoom(this.room.key, true);
    this.emit({ type: 'bossdown', kind: b.kind });
    if (b.kind === 'shade') {
      this.lit = new Set(this.roomTiles((d) => d.torch));
      this.startTalk(scriptFor('shade', this.view()), 'shade');
      this.queue.unshift({ item: 'heart', name: ITEM_INFO.heart.name, text: ITEM_INFO.heart.text, t: 2.2, dur: 2.2 });
      this.save.maxHearts = Math.min(MAX_HEARTS, this.save.maxHearts + 1);
      this.save.hearts = this.save.maxHearts * 2; this.player.hp = this.save.hearts;
      return;
    }
    this.spawnPickup('container', b.x - 14, b.y);
    this.spawnPickup('shard', b.x + 14, b.y);
  }

  roomTiles(pred) {
    const out = [];
    for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
      const i = this.idx(this.room.rx * ROOM_W + x, this.room.ry * ROOM_H + y);
      if (pred(tileDef(this.grid[i]))) out.push(i);
    }
    return out;
  }

  // ------------------------------------------------------------ rooms solving

  checkRoomCondition() {
    const r = this.room;
    if (!r.cond || this.flag(F.solved(this.area.id, r.key))) return;
    if (r.cond === 'clear') {
      if (this.enemies.length && this.enemies.every((e) => !e.alive)) this.solveRoom(r.key);
    } else if (r.cond === 'torches') {
      const torches = this.roomTiles((d) => d.torch);
      if (torches.length && torches.every((t) => this.lit.has(t))) this.solveRoom(r.key);
    } else if (r.cond === 'plates') {
      const plates = this.roomTiles((d) => d.plate);
      if (plates.length && plates.every((pl) => this.blocks.some((b) => !b.move && this.idx(b.tx, b.ty) === pl))) this.solveRoom(r.key);
    }
  }

  solveRoom(key, quiet = false) {
    const flag = F.solved(this.area.id, key);
    if (this.flag(flag)) return;
    this.setFlag(flag);
    for (const [idx, k] of this.area.gateRoom) {
      if (k === key) this.setTile(idx, tileDef(this.grid[idx]).opened || '.');
    }
    if (!quiet) this.emit({ type: 'secret' });
    this.emit({ type: 'solved', key });
    for (const pr of this.props) if (pr.type === 'chest' && pr.appear) this.emit({ type: 'appear', x: pr.rect.x, y: pr.rect.y });
    this.dirty = true;
  }

  // ------------------------------------------------------------ thrown things

  stepShots(dt) {
    const p = this.player;
    for (const s of this.shots) {
      if (s.dead) continue;
      if (s.kind === 'ember') this.stepEmber(s, dt);
      else if (s.kind === 'boomerang') this.stepBoomerang(s, dt, p);
      else if (s.kind === 'vine') this.stepVine(s, dt, p);
    }
    this.shots = this.shots.filter((s) => !s.dead);
  }

  shotTile(s) {
    const { tx, ty } = this.tileOf(s.x, s.y);
    return { tx, ty, c: this.tileAt(tx, ty), inside: this.inRoom(tx, ty) };
  }

  stepEmber(s, dt) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    const { tx, ty, c, inside } = this.shotTile(s);
    const d = tileDef(c);
    if (d.torch) { this.lightTorch(tx, ty); s.dead = true; return; }
    if (d.lamp) { this.lightLamp(tx, ty); s.dead = true; return; }
    for (const e of this.enemies) {
      if (e.alive && Math.abs(e.x - s.x) < e.hw + 3 && Math.abs(e.y - s.y) < e.hh + 3) {
        if (e.kind === 'wisp') this.damageEnemy(e, DAMAGE.ember, s.x - s.vx * 0.05, s.y - s.vy * 0.05, 'ember');
        s.dead = true;
        this.emit({ type: 'fizzle', x: s.x, y: s.y });
        return;
      }
    }
    for (const h of this.hostile) if (h.breakable && !h.dead && Math.hypot(h.x - s.x, h.y - s.y) < h.r + 4) { h.dead = true; s.dead = true; this.emit({ type: 'poof', x: h.x, y: h.y, small: true }); return; }
    if (!inside || !isFlyable(c) || s.life <= 0) {
      // A flame that lands next to a torch still lights it.
      s.dead = true;
      this.emit({ type: 'fizzle', x: s.x, y: s.y });
    }
  }

  stepBoomerang(s, dt, p) {
    s.spin += dt * 20;
    if (!s.back) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.out -= Math.hypot(s.vx, s.vy) * dt;
      const { tx, ty, c, inside } = this.shotTile(s);
      const d = tileDef(c);
      if (d.switch) { this.hitSwitch(tx, ty); s.back = true; }
      else if (d.cut && inside) this.cutTile(tx, ty, d);
      else if (!inside || !isFlyable(c) || s.out <= 0) { s.back = true; if (!isFlyable(c)) this.emit({ type: 'tink', x: s.x, y: s.y }); }
    } else {
      const d = towards(s.x, s.y, p.x, p.y - 3);
      s.x += d.x * 240 * dt; s.y += d.y * 240 * dt;
      if (Math.hypot(s.x - p.x, s.y - p.y + 3) < 8) {
        s.dead = true;
        for (const k of s.carry) this.collect(k);
        this.emit({ type: 'catch-boomerang' });
      }
    }
    for (const e of this.enemies) {
      if (!e.alive || s.hit.has(e) || Math.abs(e.x - s.x) > e.hw + 5 || Math.abs(e.y - s.y) > e.hh + 5) continue;
      s.hit.add(e);
      s.back = true;
      if (e.kind === 'bat') { this.damageEnemy(e, 2, s.x, s.y, 'boomerang'); continue; }
      if (e.kind === 'bellcrab' || e.kind === 'shade') { this.emit({ type: 'tink', x: s.x, y: s.y }); continue; }
      e.stun = e.boss ? 0.6 : 1.6;
      this.emit({ type: 'stun', x: e.x, y: e.y });
    }
    for (const k of this.pickups) {
      if (!k.dead && !k.carried && Math.hypot(k.x - s.x, k.y - s.y) < 10 && k.kind !== 'shard' && k.kind !== 'container') { k.carried = s; s.carry.push(k); }
    }
    for (const k of s.carry) { k.x = s.x; k.y = s.y; }
  }

  stepVine(s, dt, p) {
    if (p.action === 'pull') return;
    if (!s.back) {
      const step = Math.hypot(s.vx, s.vy) * dt;
      // Move in small steps so the tip can't skip a post.
      const n = Math.ceil(step / 4);
      for (let i = 0; i < n; i++) {
        s.x += s.vx * dt / n; s.y += s.vy * dt / n;
        s.len += step / n;
        const { tx, ty, c, inside } = this.shotTile(s);
        if (isPost(c) && inside) {
          // Pull Wren to the tile in front of the post.
          const fx = Math.sign(s.vx), fy = Math.sign(s.vy);
          const lx = (tx - fx) * TILE + 8, ly = (ty - fy) * TILE + 8;
          const landTile = this.tileAt(tx - fx, ty - fy);
          const dist = Math.abs(tx - Math.floor(p.x / TILE)) + Math.abs(ty - Math.floor(p.y / TILE));
          if (!isSolid(landTile) && dist >= 2) {
            p.action = 'pull';
            p.pullTo = { x: lx, y: ly };
            this.emit({ type: 'latch', x: s.x, y: s.y });
          } else s.back = true;
          return;
        }
        for (const e of this.enemies) {
          if (e.alive && Math.abs(e.x - s.x) < e.hw + 3 && Math.abs(e.y - s.y) < e.hh + 3) {
            e.stun = BOSS_TYPES[e.kind]?.vineStun || (e.boss ? 0.5 : 1.5);
            this.emit({ type: 'stun', x: e.x, y: e.y, vine: true });
            s.back = true;
            return;
          }
        }
        if (!inside || !isFlyable(c) || s.len >= s.max) {
          s.back = true;
          if (inside && !isFlyable(c)) this.emit({ type: 'tink', x: s.x, y: s.y });
          return;
        }
      }
    } else {
      const d = towards(s.x, s.y, p.x, p.y - 2);
      s.x += d.x * 360 * dt; s.y += d.y * 360 * dt;
      if (Math.hypot(s.x - p.x, s.y - p.y + 2) < 10) s.dead = true;
    }
    s.ox = p.x; s.oy = p.y - 2;
  }

  stepHostile(dt) {
    const p = this.player;
    for (const h of this.hostile) {
      if (h.dead) continue;
      h.life -= dt;
      if (h.kind === 'ring') {
        h.r += h.grow * dt;
        if (h.r >= h.maxR) h.dead = true;
        continue;
      }
      if (h.homing) {
        const d = towards(h.x, h.y, p.x, p.y);
        h.vx += (d.x * h.speed - h.vx) * Math.min(1, dt * h.homing);
        h.vy += (d.y * h.speed - h.vy) * Math.min(1, dt * h.homing);
      }
      h.x += h.vx * dt; h.y += h.vy * dt;
      const { tx, ty } = this.tileOf(h.x, h.y);
      if (h.life <= 0 || !this.inRoom(tx, ty) || (h.kind !== 'wave' && h.kind !== 'orb' && !isFlyable(this.tileAt(tx, ty)))) h.dead = true;
    }
    this.hostile = this.hostile.filter((h) => !h.dead);
  }

  checkContact() {
    const p = this.player;
    if (p.iframes > 0 || p.action === 'dash' || p.action === 'pull') return;
    for (const e of this.enemies) {
      if (!e.alive || e.stun > 0 || e.state === 'intro' || e.z > 8) continue;
      // A dazed boss is the moment to strike, so bumping it is free. The
      // toad only hurts by landing on you (its ring and seeds do the rest),
      // so walking up to a sitting toad for a swing is safe.
      if (e.boss && e.state === 'dazed') continue;
      if (e.kind === 'toad' && e.state !== 'air') continue;
      if (e.kind === 'shade' && !e.revealed && e.state !== 'rest') continue;
      if (boxHit(p, e, -2)) return this.hurt(e.dmg, e.x, e.y);
    }
    for (const h of this.hostile) {
      if (h.kind === 'ring') {
        const d = Math.hypot(p.x - h.x, p.y - h.y);
        if (Math.abs(d - h.r) < h.band) { this.hurt(h.dmg, h.x, h.y); return; }
      } else if (h.kind === 'wave') {
        if (Math.abs(p.x - h.x) < h.r + p.hw && Math.abs(p.y - h.y) < h.h + p.hh) { this.hurt(h.dmg, h.x, h.y - 20); return; }
      } else if (Math.abs(p.x - h.x) < h.r + p.hw && Math.abs(p.y - h.y) < h.r + p.hh) {
        h.dead = true;
        this.hurt(h.dmg, h.x - h.vx * 0.1, h.y - h.vy * 0.1);
        return;
      }
    }
  }

  hurt(amount, fromX, fromY) {
    const p = this.player;
    const res = hurtPlayer(p, this.save, amount, fromX, fromY);
    if (res === 'immune') return;
    this.hitstop = HITSTOP.hurt;
    this.shake(3);
    this.emit({ type: 'hurt', x: p.x, y: p.y });
    if (p.action === 'swing') p.action = null;
    if (res === 'saved') { this.say('The Fairy Tea perked you right up!'); this.emit({ type: 'heal' }); this.dirty = true; }
    if (res === 'down') {
      this.mode = 'dead';
      this.save.stats.deaths++;
      this.race = null;
      this.emit({ type: 'down' });
    }
  }

  /** After a rest: back at the last statue with full hearts and everything kept. */
  respawn() {
    const s = this.save;
    s.hearts = s.maxHearts * 2;
    this.player.hp = s.hearts;
    this.player.iframes = 1;
    this.player.kb = null;
    this.mode = 'play';
    const r = s.respawn || { area: 'overworld', x: this.areas.overworld.start.x, y: this.areas.overworld.start.y };
    this.enterArea(r.area, r.x, r.y);
  }

  // ------------------------------------------------------------ pickups

  spawnPickup(kind, x, y) {
    this.pickups.push({ kind, x, y, t: 0, life: kind === 'shard' || kind === 'container' ? Infinity : 10, z: 6, vz: 50 });
  }

  stepPickups(dt) {
    const p = this.player;
    for (const k of this.pickups) {
      if (k.dead) continue;
      k.t += dt;
      if (!k.carried) {
        k.vz -= 260 * dt; k.z = Math.max(0, k.z + k.vz * dt);
        if (k.z === 0) k.vz = Math.abs(k.vz) > 40 ? -k.vz * 0.4 : 0;
      }
      if (k.t > k.life) { k.dead = true; continue; }
      if (!k.carried && k.t > 0.25 && Math.abs(k.x - p.x) < 10 && Math.abs(k.y - p.y) < 10) this.collect(k);
    }
    this.pickups = this.pickups.filter((k) => !k.dead);
  }

  collect(k) {
    if (k.dead) return;
    k.dead = true;
    if (k.kind === 'berry') this.addBerries(1);
    else if (k.kind === 'berry5') this.addBerries(5);
    else if (k.kind === 'heart') { heal(this.save, 2); this.player.hp = this.save.hearts; }
    else if (k.kind === 'container') { this.setFlag(`bossheart:${this.area.id}`); this.addHeart(); }
    else if (k.kind === 'shard') {
      for (const o of this.pickups) if (o.kind === 'container' && !o.dead) this.collect(o);
      this.giveShard(this.area.id);
    }
    this.emit({ type: 'pickup', kind: k.kind, x: k.x, y: k.y });
  }

  // ------------------------------------------------------------ saving

  /** Copy live state into the save object (call before writing it). */
  syncSave() {
    this.save.flags = [...this.flags];
    this.save.hearts = this.player.hp;
    this.dirty = false;
    return this.save;
  }
}

/** A tile inside one of the area's rooms that Wren can stand on (damaged saves may point anywhere). */
function openSpot(area, tx, ty) {
  if (!(tx >= 0 && ty >= 0 && tx < area.w && ty < area.h)) return false;
  if (!area.rooms.has(roomKey(Math.floor(tx / ROOM_W), Math.floor(ty / ROOM_H)))) return false;
  return !isSolid(area.base[ty * area.w + tx]);
}

function boxHit(a, b, pad = 0) {
  return Math.abs(a.x - b.x) < a.hw + b.hw + pad && Math.abs(a.y - b.y) < a.hh + b.hh + pad;
}

export { overlaps };
