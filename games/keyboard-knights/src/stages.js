// Regions, stages, lessons, the bestiary and the daily quest. DOM-free data
// plus the word pool each stage draws from.
import { LETTERS, SHORT, MEDIUM, LONG, PUNCTUATED, BOSS_PASSAGES, TIER_WORDS } from './words.js';
import { HOME_ROW, BOTTOM_ROW } from './keys.js';
import { isBlocked } from './blocklist.js';
import { mulberry32, hashString, pick } from './rng.js';

// ------------------------------------------------------------ bestiary

export const MONSTERS = {
  slime: { name: 'Gloop the Slime', region: 0, fact: 'Leaves a sparkly trail and says sorry for it.' },
  jelly: { name: 'Wibble Jelly', region: 0, fact: 'Tastes like strawberry. Please do not lick.' },
  bee: { name: 'Bumble Bop', region: 0, fact: 'Hums show tunes but forgets the words.' },
  mushroom: { name: 'Grumpy Cap', region: 1, fact: 'Grumpy only until someone says good morning.' },
  snail: { name: 'Sir Snail', region: 1, fact: 'Has raced the same leaf for nine years. Winning!' },
  stump: { name: 'Sleepy Stump', region: 1, fact: 'Takes a nap between every step.' },
  goose: { name: 'Helmet Goose', region: 2, fact: 'Nobody knows where the helmet came from. Not even the goose.' },
  pumpkin: { name: 'Pumpkin Roller', region: 2, fact: 'Rolls downhill. Also uphill, somehow.' },
  pig: { name: 'Puddle Pig', region: 2, fact: 'Rates every puddle out of ten. Mostly tens.' },
  puff: { name: 'Cloud Puff', region: 3, fact: 'Rains a little when it giggles.' },
  teapot: { name: 'Teapot Trotter', region: 3, fact: 'Always ready for tea. Always.' },
  bat: { name: 'Bowtie Bat', region: 3, fact: 'Owns forty bowties, one for each mood.' },
  bookworm: { name: 'Bookworm', region: 4, fact: 'Has read every book backwards. Loved the endings first.' },
  inkblot: { name: 'Inky', region: 4, fact: 'Wants to be a full stop when it grows up.' },
  crane: { name: 'Paper Crane', region: 4, fact: 'Folded itself. Very proud of that.' },
};

export const BOSSES = {
  kingSlime: { name: 'King Slime', region: 0, fact: 'Rules the meadow from a very wobbly throne.' },
  mayorMorel: { name: 'Mayor Morel', region: 1, fact: 'Gives a speech at every puddle opening.' },
  captainHonk: { name: 'Captain Honk', region: 2, fact: 'Captain of the farm pond. The pond is very small.' },
  baronFluff: { name: 'Baron Fluff', region: 3, fact: 'His moustache is also a cloud.' },
  grumble: { name: 'Grumble', region: 4, fact: 'A sleepy dragon who only wants a bedtime story.' },
};

export const BESTIARY = [
  ...Object.keys(MONSTERS).map((id) => ({ id, boss: false, ...MONSTERS[id] })),
  ...Object.keys(BOSSES).map((id) => ({ id, boss: true, ...BOSSES[id] })),
];

// ------------------------------------------------------------ regions

export const REGIONS = [
  { id: 'meadow', name: 'Letter Meadow', tier: 0, boss: 'kingSlime', blurb: 'Single letters on the home row', sky: ['#bfe9ff', '#fff3d6'], ground: '#8fd16a', road: '#e9cf9a', accent: '#5bbf4a' },
  { id: 'woods', name: 'Mushroom Woods', tier: 1, boss: 'mayorMorel', blurb: 'Short words', sky: ['#c9e7d0', '#fbe9c8'], ground: '#5fae6b', road: '#d8b98a', accent: '#d9534f' },
  { id: 'farm', name: 'Goose Farm', tier: 2, boss: 'captainHonk', blurb: 'Longer words', sky: ['#ffd9a8', '#fff4dc'], ground: '#a7cf5b', road: '#e2c08a', accent: '#f0a030' },
  { id: 'castle', name: 'Cloud Castle', tier: 3, boss: 'baronFluff', blurb: 'Long words', sky: ['#b8c6ff', '#f2e6ff'], ground: '#9cc4e8', road: '#f1f0ff', accent: '#7c6cf0' },
  { id: 'library', name: 'Story Library', tier: 4, boss: 'grumble', blurb: 'Sentences and punctuation', sky: ['#4b3f78', '#f6c58f'], ground: '#a2765a', road: '#e8d2a8', accent: '#e86ab0' },
];

const regionMonsters = (r) => Object.keys(MONSTERS).filter((id) => MONSTERS[id].region === r);

// Stage recipes per region: [name, words, count, targetWpm, maxActive].
const RECIPES = [
  [
    ['First Steps', { letters: ['f', 'j'] }, 10, 5, 2],
    ['Bumps on F and J', { letters: ['f', 'j', 'd', 'k'] }, 12, 5, 2],
    ['Home Row Hero', { letters: [...HOME_ROW, 'g', 'h'] }, 14, 6, 3],
    ['Reach Up High', { letters: [...HOME_ROW, 'e', 'i', 'r', 'u', 't', 'y'] }, 14, 6, 3],
    ['Every Letter', { letters: LETTERS }, 16, 7, 3],
  ],
  [
    ['Tiny Toadstools', { tier: 1, len: [2, 3] }, 12, 9, 3],
    ['Three-Letter Trail', { tier: 1, len: [3, 3] }, 14, 10, 3],
    ['Four-Letter Forest', { tier: 1, len: [4, 4] }, 14, 11, 3],
    ['Mossy Mix', { tier: 1, len: [2, 4] }, 16, 12, 3],
    ['Spore Sprint', { tier: 1, len: [3, 4] }, 18, 14, 4],
  ],
  [
    ['Barnyard Gate', { tier: 2, len: [5, 5] }, 12, 14, 3],
    ['Haystack Hop', { tier: 2, len: [5, 6] }, 14, 15, 3],
    ['Pond Parade', { tier: 2, len: [6, 6] }, 14, 16, 3],
    ['Orchard Run', { tier: 2, len: [5, 6] }, 16, 18, 4],
    ['Goose Stampede', { tier: 2, len: [5, 6] }, 18, 20, 4],
  ],
  [
    ['Sky Bridge', { tier: 3, len: [7, 8] }, 12, 18, 3],
    ['Puff Pillows', { tier: 3, len: [7, 9] }, 14, 20, 3],
    ['Tower Teatime', { tier: 3, len: [8, 10] }, 14, 22, 3],
    ['Rainbow Ramparts', { tier: 3, len: [7, 12] }, 16, 24, 4],
    ['Throne of Fluff', { tier: 3, len: [9, 12] }, 16, 26, 4],
  ],
  [
    ['Capital Corridor', { tier: 4, max: 7 }, 12, 18, 3],
    ['Question Quarter', { tier: 4, max: 9 }, 14, 20, 3],
    ['Apostrophe Aisle', { tier: 4, max: 11 }, 14, 22, 3],
    ['Exclamation Hall', { tier: 4, max: 13 }, 16, 24, 4],
    ['The Last Chapter', { tier: 4, max: 20 }, 18, 26, 4],
  ],
];

const BOSS_WPM = [5, 12, 18, 24, 26];

export const STAGES = [];
REGIONS.forEach((region, r) => {
  RECIPES[r].forEach(([name, words, count, targetWpm, maxActive], i) => {
    STAGES.push({
      id: `${region.id}-${i + 1}`, region: r, index: i, name, words, count, targetWpm, maxActive,
      tier: region.tier, gentle: r === 0, monsters: regionMonsters(r), boss: null,
    });
  });
  STAGES.push({
    id: `${region.id}-boss`, region: r, index: 5, name: BOSSES[region.boss].name, words: RECIPES[r][4][1],
    count: 4, targetWpm: BOSS_WPM[r], maxActive: 2, tier: region.tier, gentle: r === 0,
    monsters: regionMonsters(r), boss: region.boss, passages: BOSS_PASSAGES[r],
  });
});

export const STAGES_PER_REGION = 6;
export const stageById = (id) => STAGES.find((s) => s.id === id) || LESSONS.find((s) => s.id === id) || null;

// ------------------------------------------------------------ lessons

const LESSON_KEYS = [
  ['F and J', ['f', 'j'], 'Find the little bumps on F and J. Your pointer fingers live there!'],
  ['D and K', ['d', 'k'], 'Middle fingers rest next door on D and K.'],
  ['S and L', ['s', 'l'], 'Ring fingers sit on S and L.'],
  ['A and ;', ['a', ';'], 'Pinkies go on A and the semicolon.'],
  ['G and H', ['g', 'h'], 'Stretch your pointers in to reach G and H.'],
  ['E and I', ['e', 'i'], 'Middle fingers reach up to E and I.'],
  ['R and U', ['r', 'u'], 'Pointer fingers reach up to R and U.'],
  ['T and Y', ['t', 'y'], 'Pointers stretch up and in for T and Y.'],
  ['W O Q P', ['w', 'o', 'q', 'p'], 'Ring fingers and pinkies reach up high.'],
  ['Bottom row', BOTTOM_ROW, 'Curl your fingers down for the bottom row.'],
  ['Capitals', ['shift'], 'Hold Shift with the other hand\'s pinky, then press the letter.'],
  ['Punctuation', ['punct'], 'Commas, full stops, question marks and friends.'],
];

export const LESSONS = [];
{
  let known = [];
  LESSON_KEYS.forEach(([name, keys, tip], i) => {
    const letters = keys.filter((k) => k.length === 1);
    known = [...known, ...letters];
    LESSONS.push({
      id: `lesson-${i + 1}`, lesson: true, index: i, name, tip, newKeys: letters.length ? letters : keys,
      keys: known.slice(), count: 12, targetWpm: 6, maxActive: 2, gentle: true, region: Math.min(4, Math.floor(i / 3)),
      tier: keys[0] === 'shift' || keys[0] === 'punct' ? 4 : 0, monsters: regionMonsters(Math.min(4, Math.floor(i / 3))), boss: null,
      words: keys[0] === 'shift' ? { capitals: true } : keys[0] === 'punct' ? { tier: 4, max: 8 } : { drill: known.slice(), focus: letters },
    });
  });
}

// ------------------------------------------------------------ word pools

const fits = (w, len) => !len || (w.length >= len[0] && w.length <= len[1]);

// Real words (from every lower-case list) typed only with these keys.
function wordsFromKeys(keys) {
  const allowed = new Set(keys);
  return [...SHORT, ...MEDIUM, ...LONG].filter((w) => w.length <= 6 && [...w].every((c) => allowed.has(c)));
}

// Deterministic drill strings ("fj", "jjf") from a key set, blocklist-checked.
export function drillStrings(keys, focus = keys, seed = 1) {
  const rng = mulberry32(hashString(keys.join('') + ':' + seed));
  const out = new Set(focus);
  for (const k of keys) out.add(k);
  let guard = 0;
  while (out.size < 40 && guard++ < 400) {
    const len = 2 + Math.floor(rng() * 3);
    let s = pick(rng, focus);
    while (s.length < len) s += rng() < 0.6 ? pick(rng, focus) : pick(rng, keys);
    if (!isBlocked(s)) out.add(s);
  }
  return [...out];
}

// The words a stage can show. Each entry is a string.
export function poolFor(stage) {
  const w = stage.words;
  if (w.letters) return w.letters.slice();
  if (w.drill) {
    const real = wordsFromKeys(w.drill);
    return [...drillStrings(w.drill, w.focus), ...real, ...real];
  }
  if (w.capitals) return SHORT.filter((s) => s.length >= 3).map((s) => s[0].toUpperCase() + s.slice(1));
  const list = TIER_WORDS[w.tier];
  if (w.tier === 4) return list.filter((s) => s.length <= (w.max || 99));
  return list.filter((s) => fits(s, w.len));
}

// ------------------------------------------------------------ daily quest

const DAILY_WPM = [6, 12, 17, 22, 24];

// Same date and tier, same quest: words, monsters and the mini-boss.
export function makeDaily(dateKey, tier) {
  const t = Math.max(0, Math.min(4, tier | 0));
  const region = REGIONS[t];
  const seed = hashString(`keyboard-knights:${dateKey}:${t}`);
  const rng = mulberry32(seed);
  const passage = pick(rng, BOSS_PASSAGES[t]).slice(0, 3);
  const words = t === 0 ? { letters: LETTERS } : t === 4 ? { tier: 4, max: 12 } : { tier: t, len: t === 3 ? [7, 10] : null };
  return {
    id: `daily-${dateKey}`, daily: true, dateKey, seed, region: t, index: 0, name: `Daily Quest · ${region.name}`,
    words, count: 14, targetWpm: DAILY_WPM[t], maxActive: 3, tier: t, gentle: t === 0,
    monsters: regionMonsters(t), boss: region.boss, passages: [passage],
  };
}
