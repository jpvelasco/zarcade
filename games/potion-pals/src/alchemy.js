// The rules of Potion Pals: what is in the pot, what comes out, hint scrolls,
// pal requests, the daily mystery and the rooms. DOM-free and testable.
import { ITEMS, ITEM, BASES, DISCOVERIES, PAL, PALS, resultOf, frontier, branchOf, BRANCHES } from './recipes.js';
import { Rng, hashString, mix } from './rng.js';

export const POT_SIZE = 3;
export const SCROLL_EVERY = 3; // one scroll per third discovery
export const POTION_SCROLLS = 2;
export const REQUEST_SCROLLS = 1;
export const DAILY_SCROLLS = 2;
export const START_SCROLLS = 2;
export const REQUEST_SLOTS = 3;

export const ROOMS = [
  { id: 'workshop', name: 'Workshop', at: 0, blurb: 'The cauldron room, and the mess that comes with it.' },
  { id: 'nook', name: 'Mossy Nook', at: 3, blurb: 'Cushions, ferns and a very small pond.' },
  { id: 'loft', name: 'Cloud Loft', at: 7, blurb: 'A hammock in the branches, above the weather.' },
  { id: 'cellar', name: 'Root Cellar', at: 12, blurb: 'Cool, dark and full of interesting jars.' },
  { id: 'deck', name: 'Star Deck', at: 18, blurb: 'A telescope and the whole sky.' },
  { id: 'attic', name: 'Dream Attic', at: 25, blurb: 'Where the sleepiest pals pile up.' },
];
export const ROOM_CAP = 6;

export const FIZZLES = [
  'Pfft! The cauldron blew a raspberry.',
  'A puff of nothing-in-particular.',
  'Blorp. That was not a potion.',
  'The cauldron sighed and gave it back.',
  'Fizz, pop, and a smell of old socks.',
  'A cloud shaped like a question mark.',
  'Nope! But a very pretty nope.',
  'The pot burped. Nobody is in trouble.',
];

export const POKES = [
  '{} does a happy little wiggle.',
  '{} boops you back.',
  '{} spins round twice.',
  '{} hums one cheerful note.',
  '{} shows you its favourite spot.',
  '{} wobbles with delight.',
  '{} blinks slowly. That means hello.',
];

export function newState(seed = 1) {
  return {
    v: 1,
    seed: seed >>> 0,
    found: {}, // id -> order found (1-based)
    pals: {}, // palId -> arrival order (1-based)
    unseen: {}, // id -> 1 while it still has a NEW! dot
    reveals: {}, // id -> how many of its inputs are shown in the book
    scrolls: START_SCROLLS,
    requests: [],
    daily: { key: '', id: '', done: false, streak: 0, best: 0 },
    stats: { brews: 0, fizzles: 0, discoveries: 0, pokes: 0, sessions: 0 },
    settings: { muted: false, music: true },
    rooms: 1,
    hintTurn: 0,
  };
}

const num = (v, d) => (Number.isFinite(v) ? v : d);

export function normalize(raw, seed = 1) {
  const s = newState(seed);
  if (!raw || typeof raw !== 'object') return s;
  s.seed = num(raw.seed, s.seed) >>> 0;
  if (raw.found && typeof raw.found === 'object') {
    let n = 0;
    for (const id of Object.keys(raw.found)) {
      if (!ITEM[id] || ITEM[id].kind === 'base') continue;
      s.found[id] = num(raw.found[id], ++n);
    }
  }
  if (raw.pals && typeof raw.pals === 'object') {
    let n = 0;
    for (const id of Object.keys(raw.pals)) if (PAL[id]) s.pals[id] = num(raw.pals[id], ++n);
  }
  if (raw.unseen && typeof raw.unseen === 'object') {
    for (const id of Object.keys(raw.unseen)) if (ITEM[id]) s.unseen[id] = 1;
  }
  if (raw.reveals && typeof raw.reveals === 'object') {
    for (const id of Object.keys(raw.reveals)) {
      if (!ITEM[id] || !ITEM[id].inputs.length) continue;
      s.reveals[id] = Math.max(0, Math.min(ITEM[id].inputs.length, num(raw.reveals[id], 0)));
    }
  }
  s.scrolls = Math.max(0, Math.round(num(raw.scrolls, START_SCROLLS)));
  if (Array.isArray(raw.requests)) {
    s.requests = raw.requests
      .filter((r) => r && PAL[r.pal] && ITEM[r.target] && s.pals[r.pal])
      .slice(0, REQUEST_SLOTS)
      .map((r) => ({
        pal: r.pal,
        target: r.target,
        tags: Array.isArray(r.tags) ? r.tags.slice(0, 2) : ITEM[r.target].tags.slice(0, 2),
        told: !!r.told,
      }));
  }
  if (raw.daily && typeof raw.daily === 'object') {
    s.daily = {
      key: typeof raw.daily.key === 'string' ? raw.daily.key : '',
      id: ITEM[raw.daily.id] ? raw.daily.id : '',
      done: !!raw.daily.done,
      streak: Math.max(0, Math.round(num(raw.daily.streak, 0))),
      best: Math.max(0, Math.round(num(raw.daily.best, 0))),
    };
  }
  if (raw.stats && typeof raw.stats === 'object') {
    for (const k of Object.keys(s.stats)) s.stats[k] = Math.max(0, Math.round(num(raw.stats[k], 0)));
  }
  if (raw.settings && typeof raw.settings === 'object') {
    s.settings.muted = !!raw.settings.muted;
    s.settings.music = raw.settings.music !== false;
  }
  s.stats.discoveries = Object.keys(s.found).length;
  s.rooms = roomsFor(Object.keys(s.pals).length);
  s.hintTurn = Math.max(0, Math.round(num(raw.hintTurn, 0)));
  return s;
}

export function roomsFor(palCount) {
  let n = 1;
  for (const r of ROOMS) if (palCount >= r.at) n = ROOMS.indexOf(r) + 1;
  return n;
}

// The local date, as a stable key for the daily mystery.
export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Yesterday's key, for the streak check.
export function prevKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(y, m - 1, d - 1);
  return dayKey(t);
}

export class Alchemy {
  constructor(state = newState()) {
    this.state = state;
    this.pot = [];
    this.events = [];
    this.rng = new Rng(mix(state.seed, 0x9e37));
  }

  // ------------------------------------------------------------- knowledge

  knows(id) {
    return ITEM[id]?.kind === 'base' || this.state.found[id] !== undefined;
  }

  get knownSet() {
    const set = new Set(BASES);
    for (const id of Object.keys(this.state.found)) set.add(id);
    return set;
  }

  // Shelf order: starters first, then discoveries newest-last, potions apart.
  shelf() {
    const list = BASES.slice();
    const found = Object.keys(this.state.found)
      .filter((id) => ITEM[id].kind === 'item')
      .sort((a, b) => this.state.found[a] - this.state.found[b]);
    return list.concat(found);
  }

  keepsakes() {
    return Object.keys(this.state.found)
      .filter((id) => ITEM[id].kind === 'potion')
      .sort((a, b) => this.state.found[a] - this.state.found[b]);
  }

  get discovered() { return Object.keys(this.state.found).length; }
  get palCount() { return Object.keys(this.state.pals).length; }
  get total() { return DISCOVERIES.length; }

  // ------------------------------------------------------------------- pot

  add(id) {
    if (!this.knows(id) || ITEM[id].kind === 'potion') return false;
    if (this.pot.length >= POT_SIZE) return false;
    this.pot.push(id);
    this.seen(id);
    return true;
  }

  remove(i) {
    if (i < 0 || i >= this.pot.length) return false;
    this.pot.splice(i, 1);
    return true;
  }

  pop() { return this.pot.length ? this.remove(this.pot.length - 1) : false; }

  clear() { this.pot.length = 0; }

  seen(id) {
    if (this.state.unseen[id]) delete this.state.unseen[id];
  }

  // ----------------------------------------------------------------- brew

  brew(dateKey = dayKey()) {
    const ids = this.pot.slice();
    if (ids.length < 2) return { ok: false, reason: 'short', hint: 'Pop at least two things in the pot.' };
    this.state.stats.brews++;
    const out = resultOf(ids);
    if (!out) {
      this.state.stats.fizzles++;
      const turn = this.state.hintTurn++;
      const res = {
        ok: false,
        reason: 'fizzle',
        inputs: ids,
        quip: FIZZLES[turn % FIZZLES.length],
        hint: this.hint(ids, turn),
      };
      this.clear();
      this.events.push({ type: 'fizzle', inputs: ids });
      return res;
    }
    const item = ITEM[out];
    const isNew = !this.knows(out);
    const res = { ok: true, id: out, item, isNew, inputs: ids, scrolls: 0, pal: null, room: 0, requests: [], daily: false };
    if (isNew) {
      this.state.found[out] = ++this.state.stats.discoveries;
      this.state.unseen[out] = 1;
      this.events.push({ type: 'found', id: out });
      if (this.state.stats.discoveries % SCROLL_EVERY === 0) res.scrolls += 1;
      if (item.kind === 'potion') res.scrolls += POTION_SCROLLS;
      if (item.pal && !this.state.pals[item.pal]) {
        this.state.pals[item.pal] = this.palCount + 1;
        res.pal = item.pal;
        this.events.push({ type: 'pal', id: item.pal });
        const rooms = roomsFor(this.palCount);
        if (rooms > this.state.rooms) {
          this.state.rooms = rooms;
          res.room = rooms;
          this.events.push({ type: 'room', room: rooms });
        }
        this.rollRequests();
      }
    }
    // Requests and the daily care about the result, new or not.
    res.requests = this.completeRequests(out);
    res.scrolls += res.requests.length * REQUEST_SCROLLS;
    if (this.state.daily.key === dateKey && !this.state.daily.done && this.state.daily.id === out) {
      this.claimDaily(dateKey);
      res.daily = true;
      res.scrolls += DAILY_SCROLLS;
      res.streak = this.state.daily.streak;
    }
    this.state.scrolls += res.scrolls;
    if (res.scrolls) this.events.push({ type: 'scrolls', n: res.scrolls });
    this.clear();
    return res;
  }

  // ---------------------------------------------------------------- hints

  // A nudge after a fizzle: name something the player already has and a word
  // for what it is missing. Never names the answer outright.
  hint(ids, turn = 0) {
    const known = this.knownSet;
    const front = frontier(known);
    if (!front.length) return 'You have found everything! Brew again for a pal request.';
    const inPot = new Set(ids);
    const shared = [];
    for (const id of front) {
      const inputs = ITEM[id].inputs;
      if (inputs.some((i) => inPot.has(i))) shared.push(id);
    }
    const pool = shared.length ? shared : front;
    const pick = ITEM[pool[turn % pool.length]];
    const have = pick.inputs.find((i) => inPot.has(i)) ?? pick.inputs[0];
    const other = pick.inputs.find((i) => i !== have) ?? pick.inputs[0];
    const word = ITEM[other].tags[turn % ITEM[other].tags.length];
    if (pick.inputs.length > 2) return `${ITEM[have].name} wants two friends, and one of them is ${word}.`;
    return `${ITEM[have].name} is waiting for something ${word}.`;
  }

  // Spend a scroll to show one more input of a recipe in the book.
  reveal(id) {
    const item = ITEM[id];
    if (!item || !item.inputs.length) return { ok: false };
    if (this.knows(id)) return { ok: false, reason: 'known' };
    const at = this.state.reveals[id] || 0;
    if (at >= item.inputs.length) return { ok: false, reason: 'full' };
    if (this.state.scrolls < 1) return { ok: false, reason: 'scrolls' };
    this.state.scrolls--;
    this.state.reveals[id] = at + 1;
    this.events.push({ type: 'reveal', id, shown: at + 1 });
    return { ok: true, shown: at + 1, of: item.inputs.length };
  }

  // The inputs the book may show: revealed ones by name, the rest hidden.
  revealed(id) {
    const item = ITEM[id];
    if (!item) return [];
    const full = this.knows(id);
    const shown = full ? item.inputs.length : this.state.reveals[id] || 0;
    // Hide in a stable order (as authored) so a second scroll adds, not swaps.
    return item.inputs.map((input, i) => (i < shown ? input : null));
  }

  // ------------------------------------------------------------- requests

  // Keep three requests alive. Targets come from the frontier so a request is
  // always something the player could brew today.
  rollRequests() {
    const owned = Object.keys(this.state.pals);
    if (!owned.length) { this.state.requests.length = 0; return; }
    const known = this.knownSet;
    let pool = frontier(known).filter((id) => ITEM[id].kind !== 'potion');
    if (!pool.length) pool = frontier(known);
    // Nothing left to find: ask for favourites instead.
    if (!pool.length) pool = Object.keys(this.state.found).filter((id) => ITEM[id].kind === 'item');
    if (!pool.length) { this.state.requests.length = 0; return; }
    const taken = new Set(this.state.requests.map((r) => r.target));
    const usedPals = new Set(this.state.requests.map((r) => r.pal));
    let guard = 0;
    while (this.state.requests.length < REQUEST_SLOTS && guard++ < 200) {
      const target = pool[this.rng.int(pool.length)];
      if (taken.has(target) && taken.size < pool.length) continue;
      const free = owned.filter((p) => !usedPals.has(p));
      const pal = (free.length ? free : owned)[this.rng.int(free.length || owned.length)];
      this.state.requests.push({ pal, target, tags: askTags(target, this.state.requests), told: false });
      taken.add(target);
      usedPals.add(pal);
    }
  }

  // Spend a scroll to have a pal say exactly what it is after.
  tellRequest(i) {
    const req = this.state.requests[i];
    if (!req) return { ok: false };
    if (req.told) return { ok: false, reason: 'told' };
    if (this.state.scrolls < 1) return { ok: false, reason: 'scrolls' };
    this.state.scrolls--;
    req.told = true;
    this.events.push({ type: 'told', target: req.target });
    return { ok: true, target: req.target };
  }

  completeRequests(id) {
    const done = this.state.requests.filter((r) => r.target === id);
    if (!done.length) return [];
    this.state.requests = this.state.requests.filter((r) => r.target !== id);
    for (const r of done) this.events.push({ type: 'request', pal: r.pal, target: r.target });
    this.rollRequests();
    return done;
  }

  // ---------------------------------------------------------------- daily

  // Choose today's mystery once, then keep it for the rest of the day, so the
  // riddle never changes while the player is chasing it.
  ensureDaily(key = dayKey()) {
    const d = this.state.daily;
    if (d.key === key && d.id) return d;
    // A streak only survives if yesterday's mystery was brewed.
    if (d.key && (!d.done || prevKey(key) !== d.key)) d.streak = 0;
    const known = this.knownSet;
    let pool = frontier(known);
    if (!pool.length) pool = Object.keys(this.state.found);
    if (!pool.length) pool = DISCOVERIES.slice(0, 8);
    const r = new Rng(mix(hashString(key), this.state.seed));
    d.key = key;
    d.id = pool[r.int(pool.length)];
    d.done = false;
    return d;
  }

  claimDaily(key = dayKey()) {
    const d = this.state.daily;
    if (d.key !== key || d.done) return { ok: false };
    d.done = true;
    d.streak += 1;
    d.best = Math.max(d.best, d.streak);
    this.events.push({ type: 'daily', streak: d.streak });
    return { ok: true, streak: d.streak };
  }

  // ------------------------------------------------------------------ pals

  poke(palId) {
    if (!this.state.pals[palId]) return null;
    const n = this.state.stats.pokes++;
    const pal = PAL[palId];
    // Every third hello repeats the bio; the rest are quick reactions.
    const line = n % 3 === 0 ? pal.bio : POKES[n % POKES.length].replace('{}', pal.name);
    return { id: palId, line };
  }

  roomOf(palId) {
    const order = this.state.pals[palId];
    if (!order) return 0;
    return palRoom(order, this.state.rooms);
  }
}

// Pals spread evenly across the unlocked rooms, by arrival order, so the same
// save always arranges the treehouse the same way.
export function palRoom(order, rooms) {
  const n = Math.max(1, rooms);
  return (order - 1) % n;
}

// ------------------------------------------------------------------- copy

// Two words that describe the target, avoiding a pair another pal is already
// asking for, so no two requests read the same.
export function askTags(target, others = []) {
  const tags = ITEM[target].tags;
  const taken = new Set(others.map((r) => r.tags.join('+')));
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const pair = [tags[i], tags[j]];
      if (!taken.has(pair.join('+'))) return pair;
    }
  }
  return tags.length >= 2 ? [tags[0], tags[1]] : [tags[0]];
}

export function requestText(req) {
  const pal = PAL[req.pal];
  const tags = req.tags.length > 1 ? `${req.tags[0]} and ${req.tags[1]}` : req.tags[0];
  return `${pal.name} wants something ${tags}.`;
}

export function riddleFor(id) {
  const item = ITEM[id];
  if (!item) return [];
  const count = item.inputs.length === 3 ? 'Three things go in' : 'Two things go in';
  const shelf = BRANCHES.find((b) => b.id === branchOf(id));
  const tags = item.tags.slice(0, 2).join(' and ');
  const inputTag = ITEM[item.inputs[0]].tags[0];
  const lines = [`${count}, and one of them is ${inputTag}.`, `What comes out is ${tags}.`];
  if (shelf) lines.push(item.kind === 'potion' ? 'It is a potion, so somebody new arrives.' : `It belongs on the ${shelf.name}.`);
  return lines;
}

export function progressText(a) {
  return `${a.discovered}/${a.total} discoveries · ${a.palCount}/${PALS.length} pals`;
}
