// The 32-map campaign over four regions. Maps 1–4 are hand-made tutorials;
// the rest come from the generator with fixed seeds. Par values come from
// tools/calibrate (the reference bot's time and sends, made generous).
import { generateMap } from './mapgen.js';
import { HEROES, HERO_ORDER, BUILDINGS } from './data.js';

export const REGIONS = [
  { id: 'clover', name: 'Clover Coast', blurb: 'Green hills, daisies and a sleepy neighbour.' },
  { id: 'windmill', name: 'Windmill Bay', blurb: 'Golden wheat, busy mills and breezy beaches.' },
  { id: 'fjords', name: 'Misty Fjords', blurb: 'Snowy pines, seals and cold blue water.' },
  { id: 'ember', name: 'Ember Isles', blurb: 'Warm black sand and sleepy volcanoes.' },
];

const T1 = ['cottage'];
const T2 = ['cottage', 'mill'];
const T3 = ['cottage', 'mill', 'tower'];
const T4 = ['cottage', 'mill', 'tower', 'forge'];
const T5 = ['cottage', 'mill', 'tower', 'forge', 'shrine'];
const T6 = ['cottage', 'mill', 'tower', 'forge', 'shrine', 'castle'];

const R = (personality, difficulty, extra = {}) => ({ personality, difficulty, ...extra });

// Tutorial layouts (world is 1600×1000).
const HAND = {
  1: {
    seed: 101,
    nodes: [
      { x: 250, y: 500, type: 'castle', owner: 1, troops: 30 },
      { x: 520, y: 300, type: 'cottage', owner: 0, troops: 3 },
      { x: 540, y: 720, type: 'cottage', owner: 0, troops: 4 },
      { x: 800, y: 500, type: 'cottage', owner: 0, troops: 8 },
      { x: 1080, y: 300, type: 'cottage', owner: 0, troops: 6 },
      { x: 1080, y: 720, type: 'cottage', owner: 0, troops: 6 },
      { x: 1350, y: 500, type: 'castle', owner: 2, troops: 8 },
    ],
  },
  2: {
    seed: 202,
    nodes: [
      { x: 230, y: 380, type: 'castle', owner: 1, troops: 28 },
      { x: 300, y: 760, type: 'cottage', owner: 0, troops: 4 },
      { x: 560, y: 560, type: 'cottage', owner: 0, troops: 6 },
      { x: 600, y: 210, type: 'cottage', owner: 0, troops: 7 },
      { x: 860, y: 780, type: 'cottage', owner: 0, troops: 9 },
      { x: 900, y: 380, type: 'cottage', owner: 0, troops: 10 },
      { x: 1180, y: 620, type: 'cottage', owner: 0, troops: 7 },
      { x: 1220, y: 220, type: 'cottage', owner: 0, troops: 6 },
      { x: 1390, y: 450, type: 'castle', owner: 2, troops: 10 },
    ],
  },
  3: {
    seed: 303,
    nodes: [
      { x: 230, y: 520, type: 'castle', owner: 1, troops: 28 },
      { x: 470, y: 280, type: 'mill', owner: 0, troops: 8 },
      { x: 470, y: 760, type: 'cottage', owner: 0, troops: 4 },
      { x: 760, y: 520, type: 'mill', owner: 0, troops: 14 },
      { x: 800, y: 180, type: 'cottage', owner: 0, troops: 8 },
      { x: 820, y: 850, type: 'cottage', owner: 0, troops: 8 },
      { x: 1100, y: 330, type: 'cottage', owner: 0, troops: 6 },
      { x: 1110, y: 740, type: 'mill', owner: 0, troops: 10 },
      { x: 1380, y: 520, type: 'castle', owner: 2, troops: 12 },
    ],
  },
  4: {
    seed: 404,
    nodes: [
      { x: 200, y: 260, type: 'castle', owner: 1, troops: 26 },
      { x: 240, y: 720, type: 'cottage', owner: 1, troops: 8 },
      { x: 520, y: 470, type: 'mill', owner: 0, troops: 10 },
      { x: 560, y: 150, type: 'cottage', owner: 0, troops: 6 },
      { x: 600, y: 850, type: 'cottage', owner: 0, troops: 6 },
      { x: 820, y: 640, type: 'cottage', owner: 0, troops: 12 },
      { x: 880, y: 290, type: 'mill', owner: 0, troops: 14 },
      { x: 1140, y: 160, type: 'cottage', owner: 0, troops: 7 },
      { x: 1080, y: 540, type: 'cottage', owner: 0, troops: 9 },
      { x: 1160, y: 860, type: 'mill', owner: 0, troops: 10 },
      { x: 1400, y: 680, type: 'castle', owner: 2, troops: 14 },
      { x: 1420, y: 300, type: 'cottage', owner: 2, troops: 6 },
    ],
  },
};

// name, region, generator settings (or hand map), rivals, star goals, intro.
export const DEFS = [
  // Clover Coast
  { name: 'First Steps', hand: 1, rivals: [R('greedy', 'easy', { grace: 60 })], goals: ['time', 'keep'], intro: 'basics' },
  { name: 'Daisy Bridges', hand: 2, rivals: [R('cautious', 'easy', { grace: 45 })], goals: ['time', 'sends'], intro: 'multi' },
  { name: 'Windmill Hill', hand: 3, rivals: [R('greedy', 'easy', { grace: 40 })], goals: ['time', 'keep'], intro: 'mill' },
  { name: 'Sunny Shore', hand: 4, rivals: [R('sneaky', 'easy', { grace: 35 })], goals: ['keep', 'sends'], intro: 'hero' },
  { name: 'Buttercup Bend', gen: { seed: 5105, size: 'small', types: T2, start: [30, 18] }, rivals: [R('cautious', 'easy')], goals: ['time', 'sends'] },
  { name: 'The Old Tower', gen: { seed: 6206, size: 'medium', types: T3, start: [30, 18] }, rivals: [R('greedy', 'easy')], goals: ['time', 'keep'], intro: 'tower' },
  { name: 'Foxglove Point', gen: { seed: 7307, size: 'medium', types: T3, start: [28, 20] }, rivals: [R('sneaky', 'easy')], goals: ['keep', 'sends'] },
  { name: 'Clover Crown', gen: { seed: 8408, size: 'medium', types: T3, start: [28, 20], extra: [1, 0] }, rivals: [R('greedy', 'normal')], goals: ['time', 'keep'] },
  // Windmill Bay
  { name: 'Breezy Bay', gen: { seed: 9509, size: 'medium', types: T3, start: [26, 20] }, rivals: [R('cautious', 'normal')], goals: ['time', 'sends'] },
  { name: 'Ember Forge', gen: { seed: 10611, size: 'medium', types: T4, start: [26, 20] }, rivals: [R('greedy', 'normal')], goals: ['time', 'keep'], intro: 'forge' },
  { name: 'Mill Race', gen: { seed: 11713, size: 'large', types: T4, start: [26, 20] }, rivals: [R('sneaky', 'normal')], goals: ['keep', 'sends'] },
  { name: 'Three Crowns', gen: { seed: 12812, size: 'small', kingdoms: 3, types: T4, start: [28, 18, 18] }, rivals: [R('greedy', 'easy'), R('cautious', 'easy')], goals: ['time', 'keep'], intro: 'rivals' },
  { name: 'Gull Rocks', gen: { seed: 13915, size: 'medium', types: T4, start: [24, 20] }, rivals: [R('sneaky', 'normal')], goals: ['time', 'sends'] },
  { name: 'Smithy Sands', gen: { seed: 14114, size: 'medium', kingdoms: 3, types: T4, start: [26, 18, 18] }, rivals: [R('cautious', 'easy'), R('sneaky', 'easy')], goals: ['keep', 'sends'] },
  { name: 'Moonlit Shrine', gen: { seed: 15216, size: 'medium', types: T5, start: [24, 20] }, rivals: [R('greedy', 'normal')], goals: ['time', 'keep'], intro: 'shrine' },
  { name: 'Harvest Fair', gen: { seed: 16319, size: 'medium', kingdoms: 3, types: T5, start: [26, 20, 20] }, rivals: [R('greedy', 'normal'), R('sneaky', 'easy')], goals: ['time', 'sends'] },
  // Misty Fjords
  { name: 'Fog Harbour', gen: { seed: 17423, size: 'medium', types: T5, start: [22, 20] }, rivals: [R('cautious', 'normal')], goals: ['time', 'keep'] },
  { name: "Wizard's Rest", gen: { seed: 18518, size: 'large', types: T5, start: [22, 20] }, rivals: [R('sneaky', 'normal')], goals: ['keep', 'sends'] },
  { name: 'Icicle Isles', gen: { seed: 19620, size: 'medium', kingdoms: 3, types: T5, start: [24, 20, 20] }, rivals: [R('cautious', 'normal'), R('greedy', 'normal')], goals: ['time', 'keep'] },
  { name: 'Pine Fjord', gen: { seed: 20720, size: 'small', types: T5, start: [24, 20] }, rivals: [R('greedy', 'hard')], goals: ['time', 'sends'], intro: 'hard' },
  { name: 'Seal Sound', gen: { seed: 21839, size: 'large', kingdoms: 3, types: T6, start: [24, 20, 20] }, rivals: [R('sneaky', 'normal'), R('cautious', 'normal')], goals: ['keep', 'sends'] },
  { name: 'Crystal Cove', gen: { seed: 22925, size: 'medium', types: T6, start: [22, 20] }, rivals: [R('cautious', 'hard')], goals: ['time', 'keep'] },
  { name: 'Northern Lights', gen: { seed: 23130, size: 'medium', kingdoms: 4, types: T6, start: [26, 20, 20, 20] }, rivals: [R('greedy', 'normal'), R('sneaky', 'normal'), R('cautious', 'easy')], goals: ['time', 'sends'], intro: 'four' },
  { name: 'Frost Throne', gen: { seed: 24235, size: 'large', kingdoms: 3, types: T6, start: [24, 20, 20] }, rivals: [R('sneaky', 'hard'), R('greedy', 'normal')], goals: ['time', 'keep'] },
  // Ember Isles
  { name: 'Ash Beach', gen: { seed: 25341, size: 'medium', types: T6, start: [22, 20] }, rivals: [R('sneaky', 'hard')], goals: ['keep', 'sends'] },
  { name: 'Lava Lagoon', gen: { seed: 26426, size: 'medium', kingdoms: 3, types: T6, start: [24, 20, 20] }, rivals: [R('greedy', 'hard'), R('cautious', 'normal')], goals: ['time', 'keep'] },
  { name: "Dragon's Nap", gen: { seed: 27527, size: 'large', types: T6, start: [22, 20] }, rivals: [R('cautious', 'hard')], goals: ['time', 'sends'] },
  { name: 'Cinder Steps', gen: { seed: 28644, size: 'medium', kingdoms: 4, types: T6, start: [24, 20, 20, 20] }, rivals: [R('sneaky', 'normal'), R('greedy', 'hard'), R('cautious', 'normal')], goals: ['keep', 'sends'] },
  { name: 'Smoky Strait', gen: { seed: 29731, size: 'large', kingdoms: 3, types: T6, start: [24, 20, 20] }, rivals: [R('sneaky', 'hard'), R('cautious', 'hard')], goals: ['time', 'keep'] },
  { name: 'Fire Fern', gen: { seed: 30830, size: 'medium', types: T6, start: [20, 20] }, rivals: [R('greedy', 'hard')], goals: ['time', 'sends'] },
  { name: 'Obsidian Bay', gen: { seed: 31933, size: 'large', kingdoms: 4, types: T6, start: [24, 20, 20, 20] }, rivals: [R('cautious', 'hard'), R('sneaky', 'normal'), R('greedy', 'hard')], goals: ['keep', 'sends'] },
  { name: 'The Grand Crown', gen: { seed: 32045, size: 'large', kingdoms: 4, types: T6, start: [26, 20, 20, 20] }, rivals: [R('greedy', 'hard'), R('sneaky', 'hard'), R('cautious', 'hard')], goals: ['time', 'keep'], intro: 'finale' },
];

// Reference-bot results (time s, sends) from tools/calibrate; see PAR_FROM.
export const BOT = [[14,16],[37,28],[35,42],[58,50],[43,40],[129,69],[52,79],[36,58],[61,66],[32,40],[58,75],[62,77],[28,33],[73,95],[37,51],[93,161],[32,30],[91,150],[86,177],[24,30],[64,154],[37,55],[65,138],[67,119],[25,32],[32,70],[35,75],[120,255],[52,114],[30,13],[38,81],[74,131]];

// Generous par: 2.5× the bot's time plus a minute, rounded up to 10 s,
// at least 2:30. The bot sends far more often than a person needs to,
// so the sends goal comes from the number of buildings to take.
function parFor(i, map) {
  const bot = BOT[i];
  const nonOwned = map.nodes.filter((n) => n.owner !== 1).length;
  const time = bot ? Math.max(150, Math.ceil((bot[0] * 2.5 + 60) / 10) * 10) : 240;
  const sends = Math.ceil(nonOwned * 1.6 + 6);
  return { time, sends };
}

export const INTROS = {
  basics: { title: 'Grow a kingdom!', text: 'Every building grows little soldiers. Drag from your castle to a grey cottage to send half of your soldiers there. Send more soldiers than it has to capture it!' },
  multi: { title: 'Gather your army', text: 'Drag through several of your buildings, then let go on a target: they all march together.' },
  mill: { title: 'Windmills', text: 'Windmills grow soldiers faster than anything else. Grab them early!' },
  hero: { title: 'A hero joins you!', text: 'Sir Pip the knight is here. Press the hero button (H), then send: her squad hits 1.5× as hard.' },
  tower: { title: 'Towers', text: 'Towers are tough to capture and shoot arrows at enemy squads walking past. Own one to guard a path.' },
  forge: { title: 'Forges', text: 'Every forge you own makes all your squads march 30% faster.' },
  rivals: { title: 'Two rivals!', text: 'Two kingdoms want this island. They fight each other too, so let them!' },
  shrine: { title: 'Shrines', text: 'Shrines are small, but each one you own makes all your buildings grow 25% faster.' },
  hard: { title: 'A clever rival', text: 'This rival is hard: quick, careful and good at sums. Grab windmills, use your hero, and attack together!' },
  four: { title: 'Four kingdoms', text: 'Three rivals at once! Expand fast and pick your fights.' },
  finale: { title: 'The Grand Crown', text: 'All three rulers together, at their very best. Good luck, Your Majesty!' },
};

export function genOptions(def) {
  const ensure = def.intro && BUILDINGS[def.intro] ? [def.intro] : [];
  return { kingdoms: 2, neutral: 1, center: true, ensure, ...def.gen };
}

function buildMap(def) {
  if (def.hand) return { seed: HAND[def.hand].seed, nodes: HAND[def.hand].nodes.map((n) => ({ ...n })), kingdoms: 2 };
  return generateMap(genOptions(def));
}

export const CAMPAIGN = DEFS.map((def, i) => {
  const map = buildMap(def);
  const region = REGIONS[Math.floor(i / 8)];
  const par = parFor(i, map);
  return {
    id: `m${i + 1}`,
    index: i,
    name: def.name,
    region: region.id,
    map,
    rivals: def.rivals,
    goals: def.goals.map((type) => ({ type, value: type === 'time' ? par.time : type === 'sends' ? par.sends : 0 })),
    intro: def.intro || null,
    types: [...new Set(map.nodes.map((n) => n.type))],
  };
});

// Players for a campaign map: owner 1 is you, rivals follow.
export function heroFor(index) {
  return [...HERO_ORDER].reverse().find((h) => HEROES[h].unlock <= index) || null;
}

export function campaignPlayers(level) {
  const players = {};
  level.rivals.forEach((r, i) => { players[i + 2] = r; });
  return players;
}

export function goalText(goal) {
  if (goal.type === 'time') {
    const m = Math.floor(goal.value / 60), s = goal.value % 60;
    return `Win within ${m}:${String(s).padStart(2, '0')}`;
  }
  if (goal.type === 'keep') return 'Never lose a building';
  if (goal.type === 'sends') return `Win in ${goal.value} sends or fewer`;
  return 'Win';
}

// Stars for a finished match: 1 for winning, plus one per goal met.
export function starsFor(level, result) {
  if (!result.won) return { stars: 0, met: level.goals.map(() => false) };
  const met = level.goals.map((g) => {
    if (g.type === 'time') return result.time <= g.value;
    if (g.type === 'keep') return result.lost === 0;
    if (g.type === 'sends') return result.sends <= g.value;
    return false;
  });
  return { stars: 1 + met.filter(Boolean).length, met };
}
