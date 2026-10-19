// The Shard Storm simulation: crystals arc up, the blade slices them, and the
// storm surge builds every time one gets past you. DOM-free — Node tests and
// the browser drive this same code. Time is scaled by slow-mo inside step, so
// `time` is game time.
import {
  FIELD, GRAVITY, BLADE, COMBO, LIVES, WAVE, KINDS, SHARD, MINE, SHIELD,
  CLUSTER, FROST, GOLD, SCORE, SURGE, BREAK, DAILY, SIZE,
} from './config.js';
import { mulberry32, clamp, lerp, segmentHitsCircle } from './math.js';

const OFF = 120; // how far past the field edges an object is dropped

// The field width for a window of viewW x viewH CSS px: the window's aspect at
// the fixed FIELD.h, clamped so very tall or very wide windows stay playable.
export function fieldWidthFor(viewW, viewH) {
  if (!(viewW > 0 && viewH > 0)) return FIELD.w;
  return clampWidth(Math.round((FIELD.h * viewW) / viewH));
}

function clampWidth(w) {
  return Number.isFinite(w) ? clamp(w, FIELD.minW, FIELD.maxW) : FIELD.w;
}

// How much bigger crystals draw (and hit) in a viewW x viewH window: 1 on
// desktops and upright phones, more on short screens, capped at SIZE.max.
export function objectScaleFor(viewW, viewH) {
  if (!(viewW > 0 && viewH > 0)) return 1;
  const px = Math.min(viewW / fieldWidthFor(viewW, viewH), viewH / FIELD.h);
  return clampSize(SIZE.refScale / px);
}

function clampSize(k) {
  return Number.isFinite(k) ? clamp(k, 1, SIZE.max) : 1;
}

// Radius per kind, so the sim, the tests and the renderer agree.
const RADIUS = { shard: SHARD.r, mine: MINE.r, cluster: CLUSTER.r, frost: FROST.r, gold: GOLD.r, piece: CLUSTER.pieceR };

// Build one crystal. `kind` drives its radius and behaviour; everything else
// is physics the caller supplies.
// `size` is the object scale (objectScaleFor); `r` is the grown hit radius.
export function newShard(kind, x, y, { vx = 0, vy = 0, color = 0, shielded = false, rot = 0, spin = 1, piece = false, size = 1 } = {}) {
  const r = (piece ? RADIUS.piece : RADIUS[kind] ?? SHARD.r) * size;
  return { kind, x, y, vx, vy, r, size, piece, shielded, color, rot, spin };
}

export class World {
  constructor({ seed = Date.now(), daily = false, target = DAILY.target, width = FIELD.w, size = 1 } = {}) {
    this.seed = seed >>> 0;
    this.w = clampWidth(width);
    this.size = clampSize(size);
    this.rng = mulberry32(this.seed);
    this.daily = daily;
    this.target = target;
    this.dailyCleared = false;

    this.time = 0;
    this.level = 0;
    this.status = 'ready'; // ready | play | over
    this.overReason = null;
    this.readyT = 2.2; // 3-2-1 countdown before the storm starts
    this.score = 0;
    this.lives = LIVES;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.slowTimer = 0;
    this.spawnTimer = 0.6; // first volley comes quickly
    this.surge = 0; // 0..1 — full costs a life
    this.breakMeter = 0; // 0..1 — full arms Storm Break
    this.stats = { sliced: 0, minesHit: 0, missed: 0, overloads: 0, breaks: 0, gold: 0 };

    this.shards = [];
    this.blade = { pts: [], life: 0 };
    this.hit = new Set(); // objects already cut by the swipe still in flight
    this.swiping = false;
    this.swipeT = 0; // how long the current swipe has been alive
    this.events = [];
  }

  // How much busier the storm is than on the classic 600-wide field. A wide
  // screen has room for more crystals, so it gets more of them, and each one
  // costs (and charges) proportionally less, so the pressure per second is
  // the same on any screen. Phones keep the tuned rate.
  get density() {
    return clamp(Math.sqrt(this.w / FIELD.w), 1, 1.6);
  }

  get breakReady() {
    return this.breakMeter >= 1;
  }

  // The window changed shape mid-run. Everything in flight is scaled across so
  // it stays on screen with its arc in proportion; heights are fixed, so y and
  // vy are untouched. Crystals take the new object scale. The live ribbon is
  // in the old coordinates, so it goes.
  setWidth(width, size = this.size) {
    const s = clampSize(size);
    if (s !== this.size) {
      for (const sh of this.shards) {
        sh.r = (sh.r / sh.size) * s;
        sh.size = s;
      }
      this.size = s;
    }
    if (!Number.isFinite(width)) return;
    const w = clampWidth(width);
    if (w === this.w) return;
    const k = w / this.w;
    for (const sh of this.shards) {
      sh.x *= k;
      sh.vx *= k;
    }
    this.w = w;
    this.blade.pts.length = 0;
    this.swiping = false;
  }

  // A new press starts a new gesture even if the old ribbon is still alive.
  endSwipe() {
    this.swiping = false;
  }

  // dt: real seconds. blade: { points: [{x,y}] } — pointer points gathered
  // since the previous step, or null for no swipe this step.
  step(dt, blade) {
    if (this.status === 'over') return;
    if (this.status === 'ready') {
      this.readyT -= dt;
      if (blade && blade.points && blade.points.length) this.sweep(blade.points);
      if (this.readyT <= 0) { this.status = 'play'; this.events.push({ type: 'go' }); }
      this.blade.life = Math.max(0, this.blade.life - dt);
      return;
    }
    const s = this.slowTimer > 0 ? COMBO.slowScale : 1;
    if (this.slowTimer > 0) {
      this.slowTimer = Math.max(0, this.slowTimer - dt);
      if (this.slowTimer === 0) this.events.push({ type: 'slowEnd' });
    }
    const gdt = dt * s;
    this.time += gdt;

    const waveLevel = Math.floor(this.time / WAVE.time);
    if (waveLevel !== this.level) {
      this.level = waveLevel;
      this.events.push({ type: 'wave', level: waveLevel });
    }

    if (this.swiping) this.swipeT += dt;
    if (blade) this.sweep(blade.points);
    this.blade.life = Math.max(0, this.blade.life - dt);
    if (this.blade.life === 0) { this.blade.pts.length = 0; this.swiping = false; }

    this.spawnTimer -= gdt;
    if (this.spawnTimer <= 0) {
      this.spawnVolley();
      this.spawnTimer = this.spawnInterval();
    }

    this.physics(gdt);

    if (this.comboTimer > 0) {
      this.comboTimer -= gdt;
      if (this.comboTimer <= 0) { this.combo = 0; this.comboTimer = 0; }
    }
  }

  // ------------------------------------------------------------ spawning

  spawnInterval() {
    const t = clamp(WAVE.baseInterval * Math.pow(WAVE.intervalDecay, this.level), WAVE.minInterval, WAVE.baseInterval);
    return t / this.density;
  }

  spawnVolley() {
    const n = this.volleySize();
    for (let i = 0; i < n; i++) this.spawnOne();
  }

  // Later waves fire volleys of a few at once.
  volleySize() {
    const chance = Math.min(0.12 + this.level * 0.03, 0.45);
    if (this.rng() > chance) return 1;
    return 2 + Math.floor(this.rng() * Math.min(WAVE.batchMax - 1, 2 + this.level));
  }

  spawnOne() {
    const kind = this.pickKind();
    // Launch and land across the whole width, with margins that grow with it.
    const mx = Math.max(30, this.w * 0.05);
    const mt = Math.max(40, this.w * 0.065);
    const x0 = lerp(mx, this.w - mx, this.rng());
    const startY = FIELD.h + SHARD.r;
    // Gold arcs higher than the rest: a prize you have to reach for.
    const hi = kind === 'gold' ? 0.98 : WAVE.riseHi;
    const lo = kind === 'gold' ? 0.82 : WAVE.riseLo;
    const apexY = lerp(FIELD.h * (1 - hi), FIELD.h * (1 - lo), this.rng());
    const v0 = Math.sqrt(2 * GRAVITY * (startY - apexY));
    const targetX = lerp(mt, this.w - mt, this.rng());
    const t = (2 * v0) / GRAVITY;
    const vx = clamp((targetX - x0) / t, -420, 420);
    const color = Math.floor(this.rng() * 6);
    const shieldable = kind === 'shard' || kind === 'cluster';
    this.shards.push(newShard(kind, x0, startY, {
      vx,
      vy: -v0,
      color,
      shielded: shieldable && this.rng() < this.shieldChance(),
      rot: this.rng() * Math.PI * 2,
      spin: (this.rng() < 0.5 ? -1 : 1) * lerp(1.5, 4, this.rng()),
      size: this.size,
    }));
  }

  // What the storm throws depends on the level, not just how often it throws.
  pickKind() {
    if (this.rng() < this.mineChance()) return 'mine';
    const r = this.rng();
    let acc = 0;
    for (const name of ['gold', 'frost', 'cluster']) {
      acc += this.kindChance(name);
      if (r < acc) return name;
    }
    return 'shard';
  }

  kindChance(name) {
    const k = KINDS[name];
    if (!k || this.level < k.from) return 0;
    return clamp(k.base + (this.level - k.from) * k.step, 0, k.max);
  }

  // No mines at all for the first two levels, then a real ramp.
  mineChance() {
    return clamp((this.level - WAVE.mineFreeLevels) * WAVE.mineChanceStep, 0, WAVE.mineChanceMax);
  }

  shieldChance() {
    if (this.level < WAVE.shieldFromLevel) return 0;
    return clamp((this.level - WAVE.shieldFromLevel + 1) * WAVE.shieldChanceStep, 0, WAVE.shieldChanceMax);
  }

  // ------------------------------------------------------------ physics

  physics(gdt) {
    let i = this.shards.length;
    while (i--) {
      const sh = this.shards[i];
      sh.vy += GRAVITY * gdt;
      sh.x += sh.vx * gdt;
      sh.y += sh.vy * gdt;
      sh.rot += sh.spin * gdt;
      if (sh.vy > 0 && sh.y - sh.r > FIELD.h + OFF) {
        this.shards.splice(i, 1);
        this.lost(sh);
      }
    }
  }

  // A crystal fell back into the storm. That is what fills the surge; a mine
  // falling away is the right outcome and buys a little relief instead.
  lost(sh) {
    if (sh.kind === 'mine') {
      this.drainSurge(SURGE.mineRelief);
      this.events.push({ type: 'mineMiss', x: sh.x });
      return;
    }
    this.stats.missed++;
    if (this.combo > 0) this.events.push({ type: 'drop', combo: this.combo });
    this.combo = 0;
    this.comboTimer = 0;
    const base = sh.kind === 'cluster' ? SURGE.clusterMiss : sh.kind === 'gold' ? SURGE.goldMiss : SURGE.perMiss;
    const cost = (base * this.missScale()) / this.density;
    this.events.push({ type: 'miss', x: sh.x, kind: sh.kind, cost });
    this.addSurge(cost);
  }

  // Misses bite harder the higher the storm climbs.
  missScale() {
    return clamp(1 + this.level * SURGE.levelScale, 1, SURGE.levelScaleMax);
  }

  addSurge(amount) {
    if (this.status !== 'play') return;
    this.surge = clamp(this.surge + amount, 0, 1);
    if (this.surge >= 1) {
      this.surge = SURGE.resetTo;
      this.stats.overloads++;
      this.events.push({ type: 'overload', lives: Math.max(0, this.lives - 1) });
      this.loseLife('surge');
    }
  }

  drainSurge(amount) {
    this.surge = clamp(this.surge - amount, 0, 1);
  }

  // One place where lives go down, so a life can never fall below zero and
  // nothing can keep hurting the player after the run is over.
  loseLife(reason) {
    if (this.status !== 'play') return;
    this.lives = Math.max(0, this.lives - 1);
    if (this.lives <= 0) {
      this.status = 'over';
      this.overReason = reason; // 'mine' or 'surge' — the results card says so
      this.events.push({ type: 'gameover', score: this.score, reason });
    }
  }

  gainLife() {
    if (this.lives >= LIVES) return false;
    this.lives++;
    this.events.push({ type: 'life', lives: this.lives });
    return true;
  }

  award(points) {
    this.score += points;
    if (this.daily && !this.dailyCleared && this.score >= this.target) {
      this.dailyCleared = true;
      this.events.push({ type: 'dailyClear', score: this.score });
    }
    return points;
  }

  // ------------------------------------------------------------ Storm Break

  // Shatter the whole field: bonus points for every crystal, mines defused
  // harmlessly, and a big dump of surge. Armed by slicing (`breakMeter`).
  stormBreak() {
    if (this.status !== 'play' || !this.breakReady) return false;
    const pts = [];
    let defused = 0;
    let gained = 0;
    for (const sh of this.shards) {
      if (sh.kind === 'mine') { defused++; continue; }
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.stats.sliced++;
      gained += this.award(SCORE.breakEach + this.combo * SCORE.comboBonus);
      pts.push({ x: sh.x, y: sh.y, kind: sh.kind, color: sh.color });
    }
    this.shards.length = 0;
    this.hit = new Set();
    this.comboTimer = COMBO.window;
    this.breakMeter = 0;
    this.stats.breaks++;
    this.drainSurge(BREAK.surgeRelief);
    this.slowTimer = Math.max(this.slowTimer, BREAK.slowDur);
    this.events.push({ type: 'break', pts, defused, score: gained, combo: this.combo });
    return true;
  }

  // ------------------------------------------------------------ slicing

  // Register a swipe: append its points to the blade ribbon and test the
  // freshly swept segments against every object. Points can arrive across
  // several steps, so the swipe's hit set lives on the world (this.hit) and
  // is valid for as long as the blade ribbon is alive (this.swiping): a
  // cracked shell or a cut gem is skipped by later points of the SAME swipe,
  // and the next swipe can touch objects again.
  sweep(points) {
    const pts = points || [];
    // A fresh gesture, or one that has run long enough to count as a new
    // stroke, starts a new hit set. Without the time cap a mouse that never
    // stops moving would be one endless swipe whose hit set only grows.
    if (!this.swiping || this.swipeT >= BLADE.maxSwipe) { this.hit = new Set(); this.swipeT = 0; }
    let hits = 0;
    let prev = this.blade.pts.length ? this.blade.pts[this.blade.pts.length - 1] : null;
    for (const p of pts) {
      if (!prev) { this.blade.pts.push(p); prev = p; continue; }
      hits += this.cutSegment(prev.x, prev.y, p.x, p.y);
      this.blade.pts.push(p);
      if (this.blade.pts.length > BLADE.maxPts) this.blade.pts.shift();
      prev = p;
    }
    if (pts.length) { this.blade.life = BLADE.life; this.swiping = true; }
    if (this.status === 'play' && (hits >= COMBO.slowShards || this.combo >= COMBO.slowCombo)) {
      this.slowTimer = Math.max(this.slowTimer, COMBO.slowDur);
      this.events.push({ type: 'slowStart' });
    }
  }

  cutSegment(ax, ay, bx, by) {
    let hits = 0;
    // A swipe that already ended the run must not keep cutting: two mines on
    // one swipe used to take lives past zero.
    if (this.status === 'over') return hits;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i];
      if (this.hit.has(sh)) continue;
      const r = sh.shielded ? SHIELD.r * sh.size : sh.r;
      if (!segmentHitsCircle(ax, ay, bx, by, sh.x, sh.y, r)) continue;
      if (sh.kind === 'mine') {
        this.hit.add(sh);
        this.shards.splice(i, 1);
        this.stats.minesHit++;
        this.combo = 0;
        this.comboTimer = 0;
        this.events.push({ type: 'mine', x: sh.x, y: sh.y, lives: Math.max(0, this.lives - 1) });
        this.loseLife('mine');
        return hits;
      }
      if (sh.shielded) {
        // The shell soaks up this swipe; the crystal inside needs the next one.
        this.hit.add(sh);
        sh.shielded = false;
        this.events.push({ type: 'shell', x: sh.x, y: sh.y });
        continue;
      }
      this.hit.add(sh);
      this.shards.splice(i, 1);
      hits += this.slice(sh);
    }
    return hits;
  }

  // Score and resolve one cut crystal. Returns 1 so the caller can count the
  // slices in this swipe (for slow-mo).
  slice(sh) {
    this.stats.sliced++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboTimer = COMBO.window;
    this.drainSurge(SURGE.perSlice);
    this.breakMeter = clamp(this.breakMeter + (sh.piece ? BREAK.perSlice * 0.5 : BREAK.perSlice) / this.density, 0, 1);
    if (this.breakMeter >= 1) this.events.push({ type: 'breakReady' });

    const combo = this.combo * SCORE.comboBonus;
    if (sh.kind === 'gold') {
      this.stats.gold++;
      const points = this.award(SCORE.gold + combo);
      const life = this.gainLife();
      this.events.push({ type: 'gold', x: sh.x, y: sh.y, points, life, combo: this.combo });
      return 1;
    }
    if (sh.kind === 'frost') {
      const points = this.award(SCORE.frost + combo);
      this.drainSurge(SURGE.frostDrain);
      this.slowTimer = Math.max(this.slowTimer, COMBO.slowDur);
      this.events.push({ type: 'frost', x: sh.x, y: sh.y, points, combo: this.combo });
      return 1;
    }
    if (sh.kind === 'cluster') {
      const points = this.award(SCORE.cluster + combo);
      const pieces = this.splitCluster(sh);
      this.events.push({ type: 'cluster', x: sh.x, y: sh.y, points, pieces, color: sh.color, combo: this.combo });
      return 1;
    }
    const points = this.award((sh.piece ? SCORE.piece : SCORE.shard) + combo);
    this.events.push({ type: 'shard', x: sh.x, y: sh.y, color: sh.color, points, combo: this.combo, piece: !!sh.piece });
    return 1;
  }

  // A cluster bursts into small shards. They join the current swipe's hit set
  // so the same swipe cannot also cut them: the combo is yours to chase.
  splitCluster(sh) {
    const n = CLUSTER.pieces;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rng() * 0.6;
      const sp = CLUSTER.spread * (0.6 + this.rng() * 0.6);
      const piece = newShard('shard', sh.x, sh.y, {
        vx: sh.vx * 0.4 + Math.cos(a) * sp,
        vy: sh.vy * 0.4 + Math.sin(a) * sp - 70,
        color: sh.color,
        rot: this.rng() * Math.PI * 2,
        spin: (this.rng() < 0.5 ? -1 : 1) * lerp(2, 6, this.rng()),
        piece: true,
        size: this.size,
      });
      this.shards.push(piece);
      this.hit.add(piece);
    }
    return n;
  }
}

// A helper for tests and the autopilot: a straight swipe line through two
// points, subdivided into the segments the sweep expects.
export function linePoints(x0, y0, x1, y1, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push({ x: lerp(x0, x1, i / n), y: lerp(y0, y1, i / n) });
  return pts;
}
