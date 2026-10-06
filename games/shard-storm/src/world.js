// The Shard Storm simulation: crystals arc up, the blade slices them, mines
// end the run. DOM-free — Node tests and the browser drive this same code.
// Time is scaled by slow-mo inside step, so `time` is game time.
import { FIELD, GRAVITY, BLADE, COMBO, LIVES, WAVE, SHARD, MINE, SHIELD, SCORE, DAILY } from './config.js';
import { mulberry32, clamp, lerp, segmentHitsCircle } from './math.js';

const OFF = 120; // how far past the field edges an object is dropped

export class World {
  constructor({ seed = Date.now(), daily = false, target = DAILY.target } = {}) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.daily = daily;
    this.target = target;
    this.dailyCleared = false;

    this.time = 0;
    this.level = 0;
    this.status = 'ready'; // ready | play | over
    this.readyT = 2.2; // 3-2-1 countdown before the storm starts
    this.score = 0;
    this.lives = LIVES;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.slowTimer = 0;
    this.spawnTimer = 0.6; // first volley comes quickly
    this.stats = { sliced: 0, minesHit: 0 };

    this.shards = [];
    this.blade = { pts: [], life: 0 };
    this.hit = new Set(); // objects already cut by the swipe still in flight
    this.events = [];
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
    return clamp(WAVE.baseInterval * Math.pow(0.93, this.level), WAVE.minInterval, WAVE.baseInterval);
  }

  spawnVolley() {
    const n = this.volleySize();
    for (let i = 0; i < n; i++) this.spawnOne();
  }

  // Later waves fire volleys of a few at once.
  volleySize() {
    const chance = Math.min(0.15 + this.level * 0.03, 0.45);
    if (this.rng() > chance) return 1;
    return 2 + Math.floor(this.rng() * Math.min(WAVE.batchMax - 1, 2 + this.level));
  }

  spawnOne() {
    const mine = this.rng() < this.mineChance();
    const x0 = lerp(30, FIELD.w - 30, this.rng());
    const startY = FIELD.h + SHARD.r;
    const apexY = lerp(FIELD.h * (1 - WAVE.riseHi), FIELD.h * (1 - WAVE.riseLo), this.rng());
    const v0 = Math.sqrt(2 * GRAVITY * (startY - apexY));
    const targetX = lerp(40, FIELD.w - 40, this.rng());
    const t = (2 * v0) / GRAVITY;
    const vx = clamp((targetX - x0) / t, -420, 420);
    const color = Math.floor(this.rng() * 6);
    this.shards.push({
      x: x0, y: startY, vx, vy: -v0,
      r: mine ? MINE.r : SHARD.r,
      mine,
      shielded: !mine && this.rng() < this.shieldChance(),
      rot: this.rng() * Math.PI * 2,
      spin: (this.rng() < 0.5 ? -1 : 1) * lerp(1.5, 4, this.rng()),
      color: mine ? -1 : color,
    });
  }

  mineChance() {
    return clamp(WAVE.mineChance0 + this.level * WAVE.mineChanceStep, 0, WAVE.mineChanceMax);
  }

  shieldChance() {
    return clamp(WAVE.shieldChance0 + this.level * WAVE.shieldChanceStep, 0, WAVE.shieldChanceMax);
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
        if (sh.mine) {
          this.events.push({ type: 'mineMiss' });
        } else {
          // A missed crystal breaks the chain.
          if (this.combo > 0) this.events.push({ type: 'drop', combo: this.combo });
          this.combo = 0;
          this.comboTimer = 0;
        }
      }
    }
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
    if (!this.swiping) this.hit = new Set();
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
      this.slowTimer = COMBO.slowDur;
      this.events.push({ type: 'slowStart' });
    }
  }

  cutSegment(ax, ay, bx, by) {
    let hits = 0;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i];
      if (this.hit.has(sh)) continue;
      const r = sh.shielded ? SHIELD.r : sh.r;
      if (!segmentHitsCircle(ax, ay, bx, by, sh.x, sh.y, r)) continue;
      if (sh.mine) {
        this.hit.add(sh);
        this.shards.splice(i, 1);
        this.stats.minesHit++;
        this.combo = 0;
        this.comboTimer = 0;
        this.lives--;
        this.events.push({ type: 'mine', x: sh.x, y: sh.y, lives: this.lives });
        if (this.lives <= 0) {
          this.status = 'over';
          this.events.push({ type: 'gameover', score: this.score });
        }
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
      this.stats.sliced++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.comboTimer = COMBO.window;
      this.score += SCORE.shard + this.combo * SCORE.comboBonus;
      hits++;
      this.events.push({ type: 'shard', x: sh.x, y: sh.y, color: sh.color, combo: this.combo });
      if (this.daily && !this.dailyCleared && this.score >= this.target) {
        this.dailyCleared = true;
        this.events.push({ type: 'dailyClear', score: this.score });
      }
    }
    return hits;
  }
}

// A helper for tests and the autopilot: a straight swipe line through two
// points, subdivided into the segments the sweep expects.
export function linePoints(x0, y0, x1, y1, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push({ x: lerp(x0, x1, i / n), y: lerp(y0, y1, i / n) });
  return pts;
}
