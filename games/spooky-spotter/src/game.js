// Progress through the manor: which rooms are awake, which ghosts have their
// things back, the curio cabinet, the daily room and every personal best.
// DOM-free so tests can play a whole save through.

import { ROOM_IDS, MODE_IDS, parTime } from './rooms.js';
import { GHOSTS } from './ghosts.js';
import { CURIOS, curioFor, mouseCurios } from './curios.js';
import { hashString, mix, dayKey, dayGap } from './rng.js';

export const SAVE_VERSION = 1;

function blankMode() {
  return { cleared: false, stars: 0, best: 0, plays: 0 };
}

export function newState(seed = 1) {
  const rooms = {};
  for (const id of ROOM_IDS) {
    rooms[id] = {};
    for (const m of MODE_IDS) rooms[id][m] = blankMode();
  }
  const ghosts = {};
  for (const g of GHOSTS) ghosts[g.id] = { returned: 0, met: false };
  return {
    v: SAVE_VERSION,
    seed: (seed >>> 0) || 1,
    rooms,
    ghosts,
    curios: [],
    mice: 0,
    mouseRooms: [],
    daily: { key: '', done: false, stars: 0, streak: 0, best: 0, plays: 0 },
    settings: { muted: false, music: true },
    totals: { found: 0, rounds: 0, hints: 0, seconds: 0 },
    party: false,
    seen: { intro: false, party: false },
  };
}

// Repair anything missing or odd so an old or hand-edited save still loads.
export function normalize(raw, seed = 1) {
  const base = newState(seed);
  if (!raw || typeof raw !== 'object') return base;
  const out = base;
  if (Number.isFinite(raw.seed)) out.seed = (raw.seed >>> 0) || 1;
  for (const id of ROOM_IDS) {
    for (const m of MODE_IDS) {
      const src = raw.rooms?.[id]?.[m];
      if (!src || typeof src !== 'object') continue;
      const slot = out.rooms[id][m];
      slot.cleared = !!src.cleared;
      slot.stars = clampInt(src.stars, 0, 3);
      slot.best = Math.max(0, Number(src.best) || 0);
      slot.plays = clampInt(src.plays, 0, 99999);
    }
  }
  for (const g of GHOSTS) {
    const src = raw.ghosts?.[g.id];
    if (!src) continue;
    out.ghosts[g.id].returned = clampInt(src.returned, 0, 99999);
    out.ghosts[g.id].met = !!src.met;
  }
  if (Array.isArray(raw.curios)) {
    const known = new Set(CURIOS.map((c) => c.id));
    out.curios = raw.curios.filter((id) => known.has(id));
  }
  out.mice = clampInt(raw.mice, 0, 9999);
  if (Array.isArray(raw.mouseRooms)) out.mouseRooms = raw.mouseRooms.filter((r) => ROOM_IDS.includes(r));
  if (raw.daily && typeof raw.daily === 'object') {
    out.daily = {
      key: typeof raw.daily.key === 'string' ? raw.daily.key : '',
      done: !!raw.daily.done,
      stars: clampInt(raw.daily.stars, 0, 3),
      streak: clampInt(raw.daily.streak, 0, 99999),
      best: clampInt(raw.daily.best, 0, 99999),
      plays: clampInt(raw.daily.plays, 0, 99999),
    };
  }
  if (raw.settings && typeof raw.settings === 'object') {
    out.settings.muted = !!raw.settings.muted;
    out.settings.music = raw.settings.music !== false;
  }
  if (raw.totals && typeof raw.totals === 'object') {
    out.totals.found = clampInt(raw.totals.found, 0, 1e9);
    out.totals.rounds = clampInt(raw.totals.rounds, 0, 1e9);
    out.totals.hints = clampInt(raw.totals.hints, 0, 1e9);
    out.totals.seconds = Math.max(0, Number(raw.totals.seconds) || 0);
  }
  out.party = !!raw.party;
  out.seen.intro = !!raw.seen?.intro;
  out.seen.party = !!raw.seen?.party;
  return out;
}

function clampInt(n, lo, hi) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

// How many stars a finished round is worth. One for finishing, always: a child
// who taps everywhere still gets a star and still moves on.
export function starsFor({ room, mode, seconds, hints = 0, misses = 0 }) {
  const par = parTime(room, mode);
  let stars = 1;
  if (seconds <= par * 1.55 && misses <= 14) stars++;
  if (seconds <= par && hints <= 1 && misses <= 7) stars++;
  return stars;
}

export class Game {
  constructor(state) {
    this.state = state;
  }

  // --- the mansion map -------------------------------------------------
  get rooms() { return this.state.rooms; }

  isUnlocked(roomId) {
    const i = ROOM_IDS.indexOf(roomId);
    if (i <= 0) return i === 0;
    return this.state.rooms[ROOM_IDS[i - 1]].find.cleared;
  }

  unlockedRooms() { return ROOM_IDS.filter((id) => this.isUnlocked(id)); }

  isModeOpen(roomId, mode) {
    if (!this.isUnlocked(roomId)) return false;
    if (mode === 'find') return true;
    return this.state.rooms[roomId].find.cleared;
  }

  isRestored(roomId) { return this.state.rooms[roomId].find.cleared; }

  restoredCount() { return ROOM_IDS.filter((id) => this.isRestored(id)).length; }

  // How awake a room looks: lights on at 1, dusty at 0.
  roomLight(roomId) {
    const r = this.state.rooms[roomId];
    const done = MODE_IDS.filter((m) => r[m].cleared).length;
    return done / MODE_IDS.length;
  }

  totalStars() {
    let n = 0;
    for (const id of ROOM_IDS) for (const m of MODE_IDS) n += this.state.rooms[id][m].stars;
    return n;
  }

  maxStars() { return ROOM_IDS.length * MODE_IDS.length * 3; }

  nextThing() {
    for (const id of ROOM_IDS) {
      if (!this.isUnlocked(id)) continue;
      for (const m of MODE_IDS) {
        if (this.isModeOpen(id, m) && !this.state.rooms[id][m].cleared) return { room: id, mode: m };
      }
    }
    return { room: ROOM_IDS[0], mode: 'find' };
  }

  // --- rounds ----------------------------------------------------------

  // A fresh layout every time you replay, but always reproducible.
  seedFor(roomId, mode, plays = null) {
    const n = plays ?? this.state.rooms[roomId][mode].plays;
    return mix(mix(this.state.seed, hashString(`${roomId}|${mode}`)), n + 1);
  }

  startRound(roomId, mode) {
    const slot = this.state.rooms[roomId][mode];
    return { room: roomId, mode, seed: this.seedFor(roomId, mode), daily: false, par: parTime(roomId, mode), best: slot.best };
  }

  // Record a finished round. Returns what to celebrate.
  finishRound({ room, mode, seconds, hints = 0, misses = 0, found = 0, daily = false, mouse = false }) {
    const s = this.state;
    const slot = s.rooms[room][mode];
    const stars = starsFor({ room, mode, seconds, hints, misses });
    // Today's room is the same for everyone, so it can land on a room the
    // player has not reached. That round still counts for the streak and the
    // mouse, but it must not open doors out of order.
    if (daily && !this.isModeOpen(room, mode)) {
      s.totals.rounds++;
      s.totals.found += found;
      s.totals.hints += hints;
      s.totals.seconds += seconds;
      const gained = mouse ? this.spotMouse(room) : [];
      this.completeDaily(stars);
      return {
        stars, firstClear: false, newBest: false, grew: false, curios: gained,
        unlockedRoom: null, party: false, par: parTime(room, mode), visit: true,
      };
    }
    const firstClear = !slot.cleared;
    const newBest = slot.best === 0 || seconds < slot.best;
    const grew = stars > slot.stars;

    slot.cleared = true;
    slot.plays++;
    if (grew) slot.stars = stars;
    if (newBest) slot.best = Math.round(seconds * 10) / 10;

    s.totals.rounds++;
    s.totals.found += found;
    s.totals.hints += hints;
    s.totals.seconds += seconds;

    const gained = [];
    const curio = curioFor(room, mode);
    if (curio && !s.curios.includes(curio.id)) { s.curios.push(curio.id); gained.push(curio.id); }
    if (mouse) gained.push(...this.spotMouse(room));

    const unlockedRoom = firstClear && mode === 'find' ? this.roomAfter(room) : null;
    const partyNow = !s.party && this.restoredCount() === ROOM_IDS.length;
    if (partyNow) s.party = true;

    if (daily) this.completeDaily(stars);

    return { stars, firstClear, newBest, grew, curios: gained, unlockedRoom, party: partyNow, par: parTime(room, mode) };
  }

  roomAfter(roomId) {
    const i = ROOM_IDS.indexOf(roomId);
    return i >= 0 && i + 1 < ROOM_IDS.length ? ROOM_IDS[i + 1] : null;
  }

  spotMouse(room) {
    const s = this.state;
    s.mice++;
    if (room && !s.mouseRooms.includes(room)) s.mouseRooms.push(room);
    const gained = [];
    for (const c of mouseCurios(s.mice)) {
      if (!s.curios.includes(c.id)) { s.curios.push(c.id); gained.push(c.id); }
    }
    return gained;
  }

  // --- ghosts ----------------------------------------------------------

  returnItem(ghostId) {
    const g = this.state.ghosts[ghostId];
    if (!g) return;
    g.returned++;
    g.met = true;
  }

  ghostKnown(ghostId) { return !!this.state.ghosts[ghostId]?.met; }

  metGhosts() { return GHOSTS.filter((g) => this.ghostKnown(g.id)).length; }

  // --- the daily room --------------------------------------------------

  dailyPlan(key = dayKey()) {
    const h = hashString(`hollowhush|${key}`);
    const room = ROOM_IDS[h % ROOM_IDS.length];
    const mode = MODE_IDS[(h >>> 5) % MODE_IDS.length];
    return { key, room, mode, seed: mix(h, 0x5eed), daily: true, par: parTime(room, mode) };
  }

  // Roll the daily over when the date changes, keeping the streak honest.
  ensureDaily(key = dayKey()) {
    const d = this.state.daily;
    if (d.key === key) return d;
    if (d.key && d.done && dayGap(d.key, key) !== 1) d.streak = 0;
    if (d.key && !d.done) d.streak = 0;
    d.key = key;
    d.done = false;
    d.stars = 0;
    return d;
  }

  completeDaily(stars) {
    const d = this.state.daily;
    if (d.done) {
      d.stars = Math.max(d.stars, stars);
      return d;
    }
    d.done = true;
    d.stars = stars;
    d.streak += 1;
    d.best = Math.max(d.best, d.streak);
    d.plays++;
    return d;
  }

  // --- the cabinet -----------------------------------------------------

  hasCurio(id) { return this.state.curios.includes(id); }
  curioCount() { return this.state.curios.length; }

  // --- a one-line summary for the title screen -------------------------
  summary() {
    const bits = [];
    const restored = this.restoredCount();
    if (restored) bits.push(`🏚️ ${restored}/${ROOM_IDS.length} rooms awake`);
    const stars = this.totalStars();
    if (stars) bits.push(`⭐ ${stars}/${this.maxStars()} stars`);
    const met = this.metGhosts();
    if (met) bits.push(`👻 ${met}/${GHOSTS.length} ghost friends`);
    if (this.curioCount()) bits.push(`🔮 ${this.curioCount()}/${CURIOS.length} curios`);
    if (this.state.daily.streak > 1) bits.push(`📅 ${this.state.daily.streak}-day streak`);
    return bits;
  }
}
