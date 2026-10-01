// Case building, DOM-free: the clue generator (seeded), clue sources and the
// kid-readable sentences for every clue and solver step.
import { Rng, hashString, mix } from './rng.js';
import { CRITTERS, PLACES, THINGS, MYSTERIES, TRACES, byId } from './data.js';
import { deduce, holds, NOT_TYPES, EITHER_TYPES } from './logic.js';

export const DIFFICULTY = {
  1: { n: 3, name: 'Easy', types: ['at', 'has', 'link'], helper: 2 },
  2: { n: 4, name: 'Medium', types: ['at', 'has', 'link', 'notAt', 'notHas'], helper: 1 },
  3: { n: 5, name: 'Hard', types: ['at', 'has', 'link', 'notAt', 'notHas', 'atEither', 'hasEither', 'whoAt', 'whoHas', 'notLink'], helper: 0 },
};

const WEIGHTS = {
  1: { at: 1, has: 1, link: 1.2 },
  2: { at: 0.8, has: 0.8, link: 1, notAt: 1.6, notHas: 1.6 },
  3: { at: 0.35, has: 0.35, link: 0.8, notAt: 1.2, notHas: 1.2, atEither: 1.4, hasEither: 1.4, whoAt: 1.3, whoHas: 1.3, notLink: 0.9 },
};

// Every true clue of the allowed types for a world.
export function truePool(n, world, types) {
  const allow = new Set(types);
  const out = [];
  const { place, thing } = world;
  for (let s = 0; s < n; s++) {
    if (allow.has('at')) out.push({ t: 'at', s, p: place[s] });
    if (allow.has('has')) out.push({ t: 'has', s, k: thing[s] });
    if (allow.has('link')) out.push({ t: 'link', k: thing[s], p: place[s] });
    for (let v = 0; v < n; v++) {
      if (v !== place[s]) {
        if (allow.has('notAt')) out.push({ t: 'notAt', s, p: v });
        if (allow.has('atEither')) out.push({ t: 'atEither', s, p: place[s], q: v });
      }
      if (v !== thing[s]) {
        if (allow.has('notHas')) out.push({ t: 'notHas', s, k: v });
        if (allow.has('hasEither')) out.push({ t: 'hasEither', s, k: thing[s], j: v });
      }
      if (v !== s) {
        if (allow.has('whoAt')) out.push({ t: 'whoAt', p: place[s], s, r: v });
        if (allow.has('whoHas')) out.push({ t: 'whoHas', k: thing[s], s, r: v });
      }
      if (allow.has('notLink') && v !== place[s]) out.push({ t: 'notLink', k: thing[s], p: v });
    }
  }
  return out.filter((c) => holds(c, place, thing));
}

// Shuffle either/or pairs so the true answer is not always named first.
function jumble(rng, c) {
  if (c.t === 'atEither' && rng.chance(0.5)) return { ...c, p: c.q, q: c.p };
  if (c.t === 'hasEither' && rng.chance(0.5)) return { ...c, k: c.j, j: c.k };
  if ((c.t === 'whoAt' || c.t === 'whoHas') && rng.chance(0.5)) return { ...c, s: c.r, r: c.s };
  return c;
}

// Pick a small set of true clues that the kid-level solver can finish.
export function pickClues(rng, n, world, difficulty) {
  const cfg = DIFFICULTY[difficulty];
  const w = WEIGHTS[difficulty];
  const pool = truePool(n, world, cfg.types).map((c) => jumble(rng, c));
  const keyed = pool.map((c) => ({ c, key: -Math.log(1 - rng.next()) / (w[c.t] || 1) }));
  keyed.sort((a, b) => a.key - b.key);
  const ordered = keyed.map((x) => x.c);
  const required = [];
  const need = [];
  if (difficulty >= 2) need.push(NOT_TYPES.filter((t) => t !== 'notLink'));
  if (difficulty >= 3) need.push(EITHER_TYPES);
  for (const kinds of need) {
    const c = ordered.find((x) => kinds.includes(x.t) && !required.includes(x));
    if (c) required.push(c);
  }
  const clues = required.slice();
  for (const c of ordered) {
    if (deduce(n, clues).solved) break;
    if (!clues.includes(c)) clues.push(c);
  }
  // Drop clues the solver can do without (never the required kinds).
  const order = rng.shuffled([...clues.keys()]);
  let kept = clues.slice();
  for (const i of order) {
    const c = clues[i];
    if (required.includes(c)) continue;
    const without = kept.filter((x) => x !== c);
    if (deduce(n, without).solved) kept = without;
  }
  // Keep a gentle number of clues: at least n + 1 on easy, so the grid has
  // something to read in every place.
  const minimum = difficulty === 1 ? n + 1 : n;
  for (const c of ordered) {
    if (kept.length >= minimum) break;
    if (!kept.includes(c) && !kept.some((x) => sameFact(x, c))) kept.push(c);
  }
  return kept;
}

function sameFact(a, b) {
  return a.t === b.t && a.s === b.s && a.p === b.p && a.k === b.k;
}

// ---------------------------------------------------------------- sentences

export function namesFor(kase) {
  return {
    who: kase.suspects.map((id) => byId(CRITTERS, id).name),
    where: kase.places.map((id) => byId(PLACES, id).name),
    what: kase.things.map((id) => byId(THINGS, id).name),
  };
}

const an = (word) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);
const poss = (name) => (name.endsWith('s') ? `${name}’` : `${name}’s`);

const TRACE_NOUN = {
  fur: 'fur', webprint: 'webbed footprints', feather: 'feather', pawprint: 'paw prints',
  hoofprint: 'hoof prints', quill: 'prickly quill', wool: 'wool', shellprint: 'slow tracks', dirt: 'dirt pile',
};

// The sentence a clue shows in the notebook and speech bubble.
export function clueLine(kase, c) {
  const N = namesFor(kase);
  const S = N.who[c.s];
  const R = c.r != null ? N.who[c.r] : '';
  const P = N.where[c.p];
  const Q = c.q != null ? N.where[c.q] : '';
  const K = c.k != null ? N.what[c.k] : '';
  const J = c.j != null ? N.what[c.j] : '';
  const src = c.src || { kind: 'talk', who: -1 };
  if (c.t === 'crime') {
    const m = byId(MYSTERIES, kase.mystery);
    if (c.kind === 'place') return `${m.crumbs}! ${m.doer} was at the ${N.where[c.idx]}.`;
    return `${m.doer} left ${an(N.what[c.idx])} behind! So ${m.doer.toLowerCase()} had the ${N.what[c.idx]}.`;
  }
  if (src.kind === 'scene') {
    if (c.t === 'at') {
      const trace = byId(CRITTERS, kase.suspects[c.s]).trace;
      return `${poss(S)} ${TRACE_NOUN[trace]}! ${S} was at the ${P}.`;
    }
    if (c.t === 'link') return `The ${K} was dropped here! Whoever had it was at the ${P}.`;
  }
  const self = src.kind === 'talk' && src.who === c.s;
  switch (c.t) {
    case 'at': return self ? `I was at the ${P}!` : `I saw ${S} at the ${P}.`;
    case 'notAt': return self ? `I was NOT at the ${P}.` : `${S} was NOT at the ${P}. I’m sure!`;
    case 'atEither': return self ? `I was at the ${P} or the ${Q}. I forget which!` : `${S} was at the ${P} or the ${Q}.`;
    case 'has': return self ? `I had the ${K} with me.` : `${S} was carrying the ${K}.`;
    case 'notHas': return self ? `I did NOT have the ${K}.` : `${S} did NOT have the ${K}.`;
    case 'hasEither': return self ? `I had the ${K} or the ${J}. Hmm, which one?` : `${S} had the ${K} or the ${J}.`;
    case 'whoAt': return `${S} or ${R} was at the ${P}.`;
    case 'whoHas': return `${S} or ${R} had the ${K}.`;
    case 'link': return `Whoever had the ${K} was at the ${P}.`;
    case 'notLink': return `Nobody took the ${K} to the ${P}.`;
    default: return '';
  }
}

const CAT_NAME = { place: 'where', thing: 'what' };

function factLine(N, f) {
  const S = N.who[f.s];
  const V = N[CAT_NAME[f.cat]][f.v];
  if (f.cat === 'place') return f.mark === 'yes' ? `${S} was at the ${V}!` : `${S} was not at the ${V}.`;
  return f.mark === 'yes' ? `${S} had the ${V}!` : `${S} did not have the ${V}.`;
}

// A hint for one solver step, in two short lines: why, then what.
export function stepLines(kase, step, clues) {
  const N = namesFor(kase);
  const facts = step.facts;
  const main = facts.find((f) => f.mark === 'yes') || facts[0];
  let so = main ? `So ${factLine(N, main)}` : '';
  // Several "no"s about one column read better as one sentence.
  const sameCol = facts.length > 1 && !facts.some((f) => f.mark === 'yes') && facts.every((f) => f.cat === main.cat && f.v === main.v);
  if (sameCol) {
    const names = facts.map((f) => N.who[f.s]);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    const V = N[CAT_NAME[main.cat]][main.v];
    so = main.cat === 'place' ? `So ${list} were not at the ${V}.` : `So ${list} did not have the ${V}.`;
  }
  const c = step.clue != null ? clues[step.clue] : null;
  const quote = c ? `“${c.text || clueLine(kase, c)}”` : '';
  switch (step.rule) {
    case 'clue': return [quote, so];
    case 'taken': {
      const V = N[CAT_NAME[step.cat]][step.v];
      const S = N.who[step.s];
      const why = step.cat === 'place' ? `${S} was at the ${V}. Nobody else was!` : `${S} had the ${V}. Nobody else did!`;
      return [why, so];
    }
    case 'onlyOne': {
      const V = N[CAT_NAME[step.cat]][step.v];
      return [`Only ${N.who[step.s]} is left for the ${V}!`, so];
    }
    case 'eitherOther': return [quote, `It was not ${N.who[step.out]}. ${so}`];
    case 'linkNoPlace':
    case 'linkNoThing':
    case 'notLinkPlace':
    case 'notLinkThing': return [quote, so];
    default: return [quote, so];
  }
}

// ---------------------------------------------------------------- building

function assignSources(rng, kase) {
  const { n } = kase;
  const sceneCount = Array(n).fill(0);
  const talkCount = Array(n).fill(0);
  const sceneOK = (c) => c.t === 'at' || c.t === 'link';
  for (const c of kase.clues) {
    if (c.t === 'crime') {
      const place = c.kind === 'place' ? c.idx : kase.home;
      c.src = { kind: 'scene', place };
      sceneCount[place]++;
      continue;
    }
    const where = c.p;
    if (sceneOK(c) && sceneCount[where] < 2 && rng.chance(c.t === 'link' ? 0.7 : 0.5)) {
      c.src = { kind: 'scene', place: where };
      sceneCount[where]++;
    }
  }
  // Talking clues: self statements go to the suspect; others to whoever has
  // said the least so far (not someone named in an either/or about two).
  for (const c of kase.clues) {
    if (c.src) continue;
    const selfable = c.s != null && c.t !== 'whoAt' && c.t !== 'whoHas';
    let who;
    if (selfable && (talkCount[c.s] === 0 || rng.chance(0.4))) who = c.s;
    else {
      const options = [...Array(n).keys()].filter((s) => s !== c.s && s !== c.r);
      const least = Math.min(...options.map((s) => talkCount[s]));
      who = rng.pick(options.filter((s) => talkCount[s] === least));
    }
    c.src = { kind: 'talk', who };
    talkCount[who]++;
  }
  // Each place gets spots for its clues out of six prop slots.
  const used = Array.from({ length: n }, () => rng.shuffled([0, 1, 2, 3, 4, 5]));
  for (const c of kase.clues) {
    if (c.src.kind === 'scene') c.src.spot = used[c.src.place].shift();
  }
  for (const c of kase.clues) c.text = clueLine(kase, c);
}

// Turn a description into a playable case. `def` gives the cast, answer and
// crime; clues come from the seeded generator unless provided.
export function buildCase(def) {
  const rng = new Rng(def.seed >>> 0);
  const n = def.suspects.length;
  const world = { place: def.solution.place.slice(), thing: def.solution.thing.slice() };
  const picked = def.clues ? def.clues.map((c) => ({ ...c })) : pickClues(rng, n, world, def.difficulty);
  const crime = { t: 'crime', kind: def.crime.kind, idx: def.crime.idx };
  const culprit = world[def.crime.kind].indexOf(def.crime.idx);
  const mystery = byId(MYSTERIES, def.mystery);
  const kase = {
    id: def.id,
    kind: def.kind || 'gen',
    seed: def.seed >>> 0,
    difficulty: def.difficulty,
    n,
    mystery: def.mystery,
    title: def.title || mystery.title,
    intro: def.intro || mystery.intro,
    ask: mystery.ask,
    suspects: def.suspects.slice(),
    places: def.places.slice(),
    things: def.things.slice(),
    solution: world,
    crime: def.crime,
    culprit,
    home: def.home ?? 0,
    clues: [crime, ...rng.shuffled(picked)],
    standing: def.standing || rng.shuffled([...Array(n).keys()]),
    flavor: def.flavor || def.suspects.map((id) => byId(CRITTERS, id).hello),
    reason: def.reason || rng.pick(mystery.reasons),
    jokes: [],
  };
  assignSources(rng, kase);
  kase.jokes = Array.from({ length: n }, () => rng.shuffled(JOKES).slice(0, 6));
  return kase;
}

// Logic clues only (the crime fact is about the answer, not the grid).
export const gridClues = (kase, found = null) => kase.clues.filter((c, i) => c.t !== 'crime' && (!found || found.has(i)));

export const JOKES = [
  'Just a pebble. A nice pebble!',
  'A snail waves hello.',
  'Only a sleepy ladybug.',
  'An old sock. Not a clue!',
  'A shiny button? No, a bottle cap.',
  'A worm says, “Busy! Busy!”',
  'Nothing here but dust. Achoo!',
  'A butterfly flutters out!',
  'A cozy spider web. Hi, spider!',
  'One lost marble. Pretty!',
  'Just leaves. Crunch, crunch!',
  'A frog hops away. Ribbit!',
];

// A generated case from a seed and a difficulty (1-3).
export function generateCase(seed, difficulty, kind = 'gen') {
  const rng = new Rng(mix(seed >>> 0, 0xc1e + difficulty));
  const n = DIFFICULTY[difficulty].n;
  const mystery = rng.pick(MYSTERIES);
  const suspects = rng.take(CRITTERS, n).map((c) => c.id);
  const places = rng.take(PLACES, n).map((p) => p.id);
  const things = rng.take(THINGS, n).map((t) => t.id);
  const solution = { place: rng.shuffled([...Array(n).keys()]), thing: rng.shuffled([...Array(n).keys()]) };
  const crime = { kind: rng.chance(0.65) ? 'place' : 'thing', idx: rng.int(n) };
  return buildCase({
    id: `${kind}-${difficulty}-${seed >>> 0}`, kind, seed: mix(seed >>> 0, 77 + difficulty), difficulty,
    mystery: mystery.id, suspects, places, things, solution, crime,
  });
}

export function dailySeed(day) {
  return hashString(`clue-critters:${day}`);
}

export function dailyCase(day) {
  return generateCase(dailySeed(day), 2, 'daily');
}
