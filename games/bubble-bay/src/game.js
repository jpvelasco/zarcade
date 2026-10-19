// One level in play: the board, the bubble queue, the creeping ceiling,
// goals, score and stars. DOM-free and deterministic for a given seed.
import { Board, traceShot, resolveShot, washRows, LOSE_ROW } from './grid.js';
import { Rng, hashSeed } from './rng.js';

export const CONTINUE_SHOTS = 5;
export const WAVE_ROWS = 3;
export const BOOSTERS = ['rainbow', 'bomb', 'zap'];

export const SCORE = { pop: 10, drop: 20, otter: 250, anchor: 1000, leftover: 100 };

export class Game {
  constructor(level, { seed = 1 } = {}) {
    this.level = level;
    this.board = new Board(level.cells.slice(), 0);
    this.rng = new Rng(hashSeed(level.seed, seed));
    this.shotsLeft = level.supply;
    this.creepIn = level.creep;
    this.score = 0;
    this.shots = 0;
    this.cleared = 0;
    this.freed = [];
    this.anchorDropped = false;
    this.continued = false;
    this.phase = 'aim'; // aim | won | lost
    this.lostReason = null;
    this.bestChain = 0;
    this.stash = null; // the bubble a booster pushed aside
    this.current = this.drawShot();
    this.next = this.drawShot();
  }

  // ------------------------------------------------------------- queue

  // Draw a color still on the board, so no bubble is ever useless.
  drawColor() {
    const present = this.board.colorsPresent();
    const pool = present.length ? present : Array.from({ length: this.level.colors }, (_, k) => k);
    return pool[this.rng.int(pool.length)];
  }

  drawShot() {
    return { kind: 'b', c: this.drawColor() };
  }

  // After a shot, re-pick any loaded color that left the board.
  refreshColors() {
    const present = new Set(this.board.colorsPresent());
    if (!present.size) return;
    for (const key of ['current', 'next']) {
      const shot = this[key];
      if (shot && shot.kind === 'b' && !present.has(shot.c)) this[key] = this.drawShot();
    }
    if (this.stash && !present.has(this.stash.c)) this.stash = this.drawShot();
  }

  swap() {
    if (this.phase !== 'aim' || !this.next || this.current.booster) return false;
    [this.current, this.next] = [this.next, this.current];
    return true;
  }

  // Load a booster as the shot. The bubble it replaces comes back after.
  // Unload any booster already loaded first (main refunds it).
  loadBooster(kind) {
    if (this.phase !== 'aim' || !BOOSTERS.includes(kind) || !this.current || this.current.booster) return false;
    this.stash = this.current;
    this.current = { kind, booster: true };
    return true;
  }

  // Put a loaded booster back (returns its kind) without firing it.
  unloadBooster() {
    if (!this.current?.booster) return null;
    const kind = this.current.kind;
    this.current = this.stash || this.drawShot();
    this.stash = null;
    return kind;
  }

  preview(angle) {
    return traceShot(this.board, angle, { pass: this.current.kind === 'zap' });
  }

  // ------------------------------------------------------------- shots

  fire(angle) {
    if (this.phase !== 'aim') return null;
    const shot = this.current;
    const trace = traceShot(this.board, angle, { pass: shot.kind === 'zap' });
    const events = resolveShot(this.board, shot, trace);
    this.shots++;

    // advance the queue
    if (shot.booster) {
      this.current = this.stash || this.next;
      if (!this.stash) this.next = this.shotsLeft > 1 ? this.drawShot() : null;
      this.stash = null;
    } else {
      this.shotsLeft--;
      this.current = this.next;
      this.next = this.shotsLeft > 1 ? this.drawShot() : null;
    }

    const gained = this.apply(events);
    let creep = false;
    if (!this.goalMet() && !this.board.isEmpty()) {
      this.creepIn--;
      if (this.creepIn <= 0) {
        this.board.drop++;
        this.creepIn = this.level.creep;
        creep = true;
      }
    }
    this.refreshColors();
    this.checkEnd();
    return { shot, trace, events, gained, creep, phase: this.phase };
  }

  apply(events) {
    let gained = 0;
    const pops = events.pops.length;
    gained += pops * SCORE.pop * (pops >= 8 ? 2 : 1);
    const drops = events.drops.filter((d) => d.cell.k !== 'anchor').length;
    gained += drops * SCORE.drop * (drops >= 10 ? 2 : 1);
    gained += events.freed.length * SCORE.otter;
    if (events.anchor) { gained += SCORE.anchor; this.anchorDropped = true; }
    for (const f of events.freed) this.freed.push(f.cell.o);
    this.cleared += events.cleared;
    this.bestChain = Math.max(this.bestChain, pops + drops);
    this.score += gained;
    return gained;
  }

  goalProgress() {
    const goal = this.level.goal;
    if (goal.type === 'otters') return { have: Math.min(goal.need, this.freed.length), need: goal.need };
    if (goal.type === 'pop') return { have: Math.min(goal.need, this.cleared), need: goal.need };
    return { have: this.anchorDropped ? 1 : 0, need: 1 };
  }

  goalMet() {
    const { have, need } = this.goalProgress();
    return have >= need;
  }

  checkEnd() {
    if (this.goalMet() || this.board.isEmpty()) {
      this.win();
      return;
    }
    if (this.board.pastLine()) this.lose('line');
    else if (!this.current) this.lose('shots');
  }

  win() {
    this.phase = 'won';
    this.leftover = this.shotsLeft;
    this.score += this.leftover * SCORE.leftover;
  }

  lose(reason) {
    this.phase = 'lost';
    this.lostReason = reason;
  }

  stars() {
    if (this.phase !== 'won') return 0;
    const [, two, three] = this.level.stars;
    return this.leftover >= three ? 3 : this.leftover >= two ? 2 : 1;
  }

  canContinue() {
    return this.phase === 'lost' && !this.continued;
  }

  // One free continue: five more bubbles and a wave that washes the low rows.
  useContinue() {
    if (!this.canContinue()) return null;
    this.continued = true;
    this.phase = 'aim';
    this.lostReason = null;
    this.shotsLeft += CONTINUE_SHOTS;
    const events = washRows(this.board, Math.max(1, LOSE_ROW - WAVE_ROWS));
    this.apply(events);
    if (!this.current) this.current = this.drawShot();
    if (!this.next && this.shotsLeft > 1) this.next = this.drawShot();
    this.creepIn = this.level.creep;
    this.refreshColors();
    this.checkEnd();
    return events;
  }

  giveUp() {
    this.continued = true;
  }

  // Fewest shots in the queue display: the loaded bubble counts.
  get queueCount() {
    return this.shotsLeft;
  }
}
