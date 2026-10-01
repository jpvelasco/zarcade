// A whole match: a series of rounds (Last Blob Standing) or one long round
// (King of the Hill, Coin Grab), arena rotation, and the final podium.
// DOM-free; `simulateMatch` plays bot-only matches for tests and balance.
import { World } from './world.js';
import { Bot } from './ai.js';
import { ARENA_IDS } from './arenas.js';
import { Rng, hashSeed } from './rng.js';
import { DEFAULT_TARGET, MODES, STEP, ROUND } from './config.js';

export function defaultSettings() {
  return { mode: 'lbs', target: { ...DEFAULT_TARGET }, arena: 'cycle', bots: 3, botLevel: 'normal', powerups: true, hazards: true };
}

// Fix up settings from a save or the URL.
export function cleanSettings(s = {}) {
  const d = defaultSettings();
  const out = { ...d, ...(s && typeof s === 'object' ? s : {}) };
  if (!MODES.includes(out.mode)) out.mode = d.mode;
  out.target = { ...d.target, ...(s && typeof s.target === 'object' ? s.target : {}) };
  for (const m of MODES) {
    const v = out.target[m] | 0;
    out.target[m] = v > 0 && v <= 99 ? v : d.target[m];
  }
  if (out.arena !== 'cycle' && out.arena !== 'random' && !ARENA_IDS.includes(out.arena)) out.arena = 'cycle';
  out.bots = Math.max(0, Math.min(3, out.bots | 0));
  if (!['easy', 'normal', 'hard'].includes(out.botLevel)) out.botLevel = 'normal';
  out.powerups = out.powerups !== false;
  out.hazards = out.hazards !== false;
  return out;
}

export class Match {
  // players: [{ name, look, bot: null | 'easy' | 'normal' | 'hard' }]
  constructor(settings, players, seed = 1) {
    this.settings = cleanSettings(settings);
    this.players = players;
    this.seed = seed >>> 0;
    this.rng = new Rng(hashSeed(this.seed, 0x3a7c));
    this.mode = this.settings.mode;
    this.target = this.settings.target[this.mode];
    this.wins = players.map(() => 0);
    this.totals = players.map(() => ({ bonks: 0, ringouts: 0, pounds: 0, falls: 0, coins: 0, dashes: 0, powerups: 0 }));
    this.round = 0;
    this.history = [];
    this.winner = -1;
    this.ranking = null;
    this.order = this.rng.shuffle(ARENA_IDS.slice());
    // Never-ending draws can't happen: after this many rounds the leader wins.
    this.maxRounds = this.mode === 'lbs' ? this.target * players.length + 2 : 1;
  }

  nextArena() {
    const a = this.settings.arena;
    if (a === 'cycle') return this.order[this.round % this.order.length];
    if (a === 'random') return ARENA_IDS[this.rng.int(ARENA_IDS.length)];
    return a;
  }

  // Build the next round's world.
  nextRound() {
    const arena = this.nextArena();
    this.round++;
    const world = new World({
      arena, mode: this.mode, players: this.players, seed: hashSeed(this.seed, this.round),
      powerups: this.settings.powerups, hazards: this.settings.hazards,
      target: this.mode === 'lbs' ? undefined : this.target,
    });
    world.round = this.round;
    return world;
  }

  // Record a finished world. Returns { roundWinner, matchWinner }.
  endRound(world) {
    const res = world.result || { winner: -1, ranking: world.blobs.map((b) => b.i) };
    for (const b of world.blobs) for (const k of Object.keys(this.totals[b.i])) this.totals[b.i][k] += b.stats[k];
    this.history.push({ arena: world.arenaDef.id, winner: res.winner });
    if (this.mode !== 'lbs') {
      this.winner = res.winner;
      this.ranking = res.ranking;
      this.scores = world.blobs.map((b) => Math.floor(b.score));
      return { roundWinner: res.winner, matchWinner: this.winner };
    }
    if (res.winner >= 0) this.wins[res.winner]++;
    const champ = this.wins.findIndex((w) => w >= this.target);
    if (champ >= 0 || this.round >= this.maxRounds) {
      this.ranking = this.rankWins();
      this.winner = this.ranking[0];
    }
    return { roundWinner: res.winner, matchWinner: this.winner };
  }

  rankWins() {
    return this.players.map((_, i) => i).sort((a, b) => this.wins[b] - this.wins[a] || this.totals[b].ringouts - this.totals[a].ringouts || this.totals[a].falls - this.totals[b].falls || a - b);
  }

  get over() { return this.winner >= 0; }

  // Score shown in the HUD for a player during a round.
  score(i, world) {
    return this.mode === 'lbs' ? this.wins[i] : Math.floor(world.blobs[i].score);
  }
}

// Play one round with bots for every blob. Returns the finished world.
export function simulateRound(world, bots, { maxSeconds = 400 } = {}) {
  const controls = [];
  const limit = Math.ceil(maxSeconds / STEP);
  for (let s = 0; s < limit && world.phase !== 'done'; s++) {
    for (let i = 0; i < bots.length; i++) controls[i] = bots[i].controls(world, STEP);
    world.step(STEP, controls);
    world.events.length = 0;
  }
  return world;
}

// A whole bot-vs-bot match, for tests, balance and the attract mode.
export function simulateMatch(settings, players, seed = 1) {
  const match = new Match(settings, players, seed);
  const rounds = [];
  while (!match.over) {
    const world = match.nextRound();
    const bots = players.map((p, i) => new Bot(i, p.bot || 'normal', hashSeed(seed, match.round, i)));
    simulateRound(world, bots);
    rounds.push({ arena: world.arenaDef.id, winner: world.result?.winner ?? -1, seconds: world.t, done: world.phase === 'done' });
    match.endRound(world);
    if (match.round > 40) break;
  }
  return { match, rounds };
}

export const OUTRO_SECONDS = ROUND.outro;
