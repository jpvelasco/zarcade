// The typing battle: monsters walk in along the road carrying words, the
// player types them, combos charge the Star Spin. DOM-free and deterministic:
// the page feeds it time steps and characters and reads `events`.
import { mulberry32, pick } from './rng.js';
import { createPicker } from './picker.js';
import { poolFor } from './stages.js';
import { wpm, accuracy } from './stats.js';

export const SPAWN_X = 104; // monsters appear just off the right edge
export const VIEW_X = 100; // visible (typeable) from here leftwards
export const REACH_X = 12; // the knight's guard line
export const BOSS_X = VIEW_X - 8; // a boss strides in quickly to here, fully on screen
const BOSS_ENTRY_TIME = 1.2;
export const METER_MAX = 10;
export const HEARTS = 3;
export const LANES = 3;

export function multiplier(combo) {
  return Math.min(3, 1 + 0.5 * Math.floor(combo / 5));
}

// Stars: finish, then accuracy, then accuracy with at most one bonk.
export function starsFor({ acc, bonks }) {
  if (acc >= 0.95 && bonks <= 1) return 3;
  if (acc >= 0.85) return 2;
  return 1;
}

// Speed scale from the player's recent WPM and failed attempts at a stage.
export function paceFor(stage, { recentWpm = 0, fails = 0 } = {}) {
  let scale = 1;
  if (recentWpm > stage.targetWpm * 1.5) scale = Math.min(1.25, 1 + (recentWpm / stage.targetWpm - 1.5) * 0.25);
  scale *= Math.max(0.55, 1 - 0.15 * fails);
  return Math.round(scale * 100) / 100;
}

export class Battle {
  constructor(stage, opts = {}) {
    this.stage = stage;
    this.seed = opts.seed ?? (stage.seed || 1);
    this.rng = mulberry32(this.seed);
    this.picker = opts.picker || createPicker({
      pool: poolFor(stage), rng: mulberry32(this.seed ^ 0x9e3779b9),
      keyStats: opts.keyStats || {}, adaptive: opts.adaptive ?? !stage.daily,
    });
    this.caseless = !!opts.caseless;
    this.gentle = opts.gentle ?? !!stage.gentle;
    this.speedScale = opts.speedScale ?? 1;
    this.cps = (stage.targetWpm * 5) / 60;

    this.time = 0;
    this.monsters = [];
    this.nextId = 1;
    this.spawned = 0;
    this.spawnTimer = 0.6;
    this.lastLane = 1;
    this.boss = null;
    this.bossDone = !stage.boss;
    this.target = null;
    this.combo = 0;
    this.maxCombo = 0;
    this.meter = 0;
    this.score = 0;
    this.hearts = HEARTS;
    this.stumble = 0;
    this.status = 'play'; // play | cleared | failed
    this.events = [];
    this.lastKeyAt = 0;
    this.stats = { correct: 0, typos: 0, words: 0, chars: 0, activeTime: 0, bonks: 0, escaped: 0, specials: 0 };
  }

  // ------------------------------------------------------------ queries

  get alive() { return this.monsters; }
  get wpm() { return wpm(this.stats.correct, this.stats.activeTime); }
  get accuracy() { return accuracy(this.stats.correct, this.stats.typos); }
  get progress() {
    const total = this.stage.count + (this.stage.boss ? 1 : 0);
    return Math.min(1, (this.stats.words + this.stats.escaped) / total);
  }

  rating() { return starsFor({ acc: this.accuracy, bonks: this.stats.bonks }); }

  summary() {
    return {
      stars: this.rating(), score: this.score, wpm: this.wpm, acc: this.accuracy,
      words: this.stats.words, maxCombo: this.maxCombo, bonks: this.stats.bonks,
      typos: this.stats.typos, correct: this.stats.correct, time: Math.round(this.time),
    };
  }

  equal(a, b) {
    return this.caseless ? a.toLowerCase() === b.toLowerCase() : a === b;
  }

  // ------------------------------------------------------------ spawning

  travelTime(word) {
    return 3 + (2.5 * word.length) / this.cps;
  }

  speedFor(word) {
    return ((SPAWN_X - REACH_X) / this.travelTime(word)) * this.speedScale;
  }

  chooseLane() {
    const options = [0, 1, 2].filter((l) => l !== this.lastLane);
    this.lastLane = pick(this.rng, options);
    return this.lastLane;
  }

  spawnMinion() {
    const avoid = new Set(this.monsters.map((m) => m.word[m.typed]?.toLowerCase()).filter(Boolean));
    for (const m of this.monsters) avoid.add(m.word[0].toLowerCase());
    const word = this.picker.next(avoid);
    const type = pick(this.rng, this.stage.monsters);
    const m = {
      id: this.nextId++, type, word, typed: 0, x: SPAWN_X, lane: this.chooseLane(),
      speed: this.speedFor(word), state: 'walk', boss: false, age: 0,
    };
    this.monsters.push(m);
    this.spawned++;
    this.spawnTimer = Math.max(1, (word.length / this.cps) * 1.3 + 0.8) / this.speedScale;
    this.events.push({ type: 'spawn', id: m.id, monster: type });
    return m;
  }

  spawnBoss() {
    const phrases = pick(this.rng, this.stage.passages);
    const b = {
      id: this.nextId++, type: this.stage.boss, phrases, phrase: 0, word: phrases[0], typed: 0,
      x: SPAWN_X + 6, lane: 1, speed: 0, state: 'walk', boss: true, age: 0, hp: phrases.length, entering: true,
    };
    b.speed = (b.x - BOSS_X) / BOSS_ENTRY_TIME;
    this.boss = b;
    this.monsters.push(b);
    this.events.push({ type: 'boss', id: b.id, monster: b.type });
    return b;
  }

  bossSpeed(b) {
    return ((SPAWN_X - REACH_X) / (4 + (3 * b.word.length) / this.cps)) * this.speedScale * 0.8;
  }

  // ------------------------------------------------------------ stepping

  step(dt) {
    if (this.status !== 'play') return;
    this.time += dt;
    this.stumble = Math.max(0, this.stumble - dt);
    const minions = this.monsters.filter((m) => !m.boss).length;
    if (this.monsters.some((m) => m.x <= VIEW_X)) this.stats.activeTime += dt;

    if (this.spawned < this.stage.count) {
      this.spawnTimer -= dt;
      const room = minions < this.stage.maxActive && (!this.boss || minions < 1);
      if ((this.spawnTimer <= 0 && room) || this.monsters.length === 0) this.spawnMinion();
    } else if (this.stage.boss && !this.boss && !this.bossDone && minions === 0) {
      this.spawnBoss();
    }

    for (const m of this.monsters.slice()) {
      m.age += dt;
      if (m.state === 'wait') continue;
      m.x -= m.speed * dt;
      if (m.entering && m.x <= BOSS_X) { m.entering = false; m.speed = this.bossSpeed(m); }
      if (m.x <= REACH_X) {
        m.x = REACH_X;
        if (this.gentle) {
          m.state = 'wait';
          this.events.push({ type: 'wait', id: m.id });
        } else {
          this.bonk(m);
        }
      }
    }

    if (this.spawned >= this.stage.count && this.bossDone && this.monsters.length === 0) {
      this.status = 'cleared';
      this.events.push({ type: 'cleared', ...this.summary() });
    }
  }

  bonk(m) {
    this.hearts -= 1;
    this.stats.bonks += 1;
    // Ease off a little after every bonk so a struggling player catches up.
    this.speedScale = Math.max(0.5, this.speedScale * 0.88);
    for (const x of this.monsters) x.speed *= 0.88;
    this.combo = 0;
    if (this.target === m.id) this.target = null;
    this.events.push({ type: 'bonk', id: m.id, monster: m.type, boss: m.boss, lane: m.lane, hearts: this.hearts });
    if (m.boss) {
      m.x = 72;
      m.typed = 0;
    } else {
      this.remove(m);
      this.stats.escaped += 1;
    }
    if (this.hearts <= 0) {
      this.status = 'failed';
      this.events.push({ type: 'failed', ...this.summary() });
    }
  }

  remove(m) {
    const i = this.monsters.indexOf(m);
    if (i >= 0) this.monsters.splice(i, 1);
  }

  // ------------------------------------------------------------ typing

  findTarget(ch) {
    let best = null;
    for (const m of this.monsters) {
      // A boss's phrase shows as it strides in, so it can be typed straight away.
      if ((m.x > VIEW_X + 2 && !m.boss) || m.typed !== 0) continue;
      if (!this.equal(m.word[0], ch)) continue;
      if (!best || m.x < best.x) best = m;
    }
    return best;
  }

  // Type one character. Returns 'hit', 'typo' or 'ignored'.
  type(ch) {
    if (this.status !== 'play' || typeof ch !== 'string' || ch.length !== 1) return 'ignored';
    let m = this.target ? this.monsters.find((x) => x.id === this.target) : null;
    if (!m) {
      this.target = null;
      if (ch === ' ') return 'ignored';
      m = this.findTarget(ch);
      if (!m) {
        this.typo(null, ch);
        return 'typo';
      }
      this.target = m.id;
      this.events.push({ type: 'lock', id: m.id });
    }
    const expected = m.word[m.typed];
    if (!this.equal(expected, ch)) {
      this.typo(expected, ch, m);
      return 'typo';
    }
    const ms = m.typed > 0 ? Math.round((this.time - this.lastKeyAt) * 1000) : null;
    this.lastKeyAt = this.time;
    m.typed += 1;
    this.stats.correct += 1;
    this.events.push({ type: 'key', ch: expected, ok: true, ms, id: m.id });
    if (m.typed >= m.word.length) this.complete(m);
    return 'hit';
  }

  typo(expected, ch, m = null) {
    this.stats.typos += 1;
    this.combo = 0;
    this.stumble = 0.35;
    this.lastKeyAt = this.time;
    this.events.push({ type: 'typo', expected, ch, id: m ? m.id : null });
    if (expected != null) this.events.push({ type: 'key', ch: expected, ok: false, ms: null, id: m.id });
  }

  charge(n) {
    const before = this.meter;
    this.meter = Math.min(METER_MAX, this.meter + n);
    if (before < METER_MAX && this.meter >= METER_MAX) this.events.push({ type: 'meterFull' });
  }

  complete(m) {
    this.target = null;
    if (m.boss) return this.bossPhraseDone(m, false);
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const points = Math.round(10 * m.word.length * multiplier(this.combo));
    this.score += points;
    this.stats.words += 1;
    this.stats.chars += m.word.length;
    this.charge(1 + (this.combo % 5 === 0 ? 1 : 0));
    if (this.combo % 5 === 0) this.events.push({ type: 'combo', combo: this.combo });
    this.remove(m);
    this.events.push({ type: 'poof', id: m.id, monster: m.type, word: m.word, x: m.x, lane: m.lane, points, combo: this.combo });
  }

  bossPhraseDone(b, bySpecial) {
    const points = Math.round(12 * b.word.length * multiplier(this.combo));
    this.score += points;
    if (!bySpecial) {
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.stats.chars += b.word.length;
      this.charge(1);
    }
    b.phrase += 1;
    b.hp = b.phrases.length - b.phrase;
    if (b.phrase >= b.phrases.length) {
      this.stats.words += 1;
      this.remove(b);
      this.boss = null;
      this.bossDone = true;
      this.events.push({ type: 'bossDefeated', id: b.id, monster: b.type, x: b.x, lane: b.lane, points });
      return;
    }
    b.word = b.phrases[b.phrase];
    b.typed = 0;
    b.x = Math.min(VIEW_X - 8, b.x + 16);
    b.state = 'walk';
    b.speed = this.bossSpeed(b);
    this.events.push({ type: 'bossHit', id: b.id, monster: b.type, x: b.x, lane: b.lane, points, hp: b.hp });
  }

  // Star Spin: poof every minion, knock the boss's current phrase off.
  special() {
    if (this.status !== 'play' || this.meter < METER_MAX) return false;
    // Nothing to hit yet: keep the charge.
    if (!this.monsters.some((m) => m.boss || m.x <= VIEW_X)) return false;
    this.meter = 0;
    this.stats.specials += 1;
    this.target = null;
    const poofs = [];
    for (const m of this.monsters.slice()) {
      if (m.boss || m.x > VIEW_X) continue;
      const points = 5 * m.word.length;
      this.score += points;
      this.stats.words += 1;
      this.remove(m);
      poofs.push({ id: m.id, monster: m.type, x: m.x, lane: m.lane, points });
    }
    this.events.push({ type: 'special', count: poofs.length });
    for (const p of poofs) this.events.push({ type: 'poof', ...p, special: true });
    if (this.boss) this.bossPhraseDone(this.boss, true);
    return true;
  }

  // The character the player should press next (for lesson hints).
  nextChar() {
    const m = this.target ? this.monsters.find((x) => x.id === this.target) : null;
    if (m) return m.word[m.typed];
    let best = null;
    for (const x of this.monsters) if (x.x <= VIEW_X && (!best || x.x < best.x)) best = x;
    return best ? best.word[best.typed] : null;
  }
}
