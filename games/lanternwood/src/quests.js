// Quest log: definitions and a small state machine. Quest state lives in the
// save as { [id]: { stage, count } }; stage -1 means "not started" (hidden
// from the log). Events are plain strings such as 'talk:mira' or 'honeycap'.
// `questEvent` returns the rewards earned so the game can hand them out.

export const QUESTS = [
  {
    id: 'main', title: 'The Great Lantern', main: true,
    stages: [
      'Talk to Grandma Wick beside the Great Lantern in Lantern Plaza.',
      'Find the first Flame Shard in Mossy Burrow, west in Mosswood Hollow.',
      'Lower the stuck drawbridge east of Market Row, then find the Sunken Bell Temple on Lake Shimmer.',
      'Swing across the chasm north of the village and climb to Clockwork Peak.',
      'Bring all three Flame Shards to Grandma Wick at the Great Lantern.',
      'Lanternwood glows again. Thank you, Wren!',
    ],
  },
  {
    id: 'cat', title: 'Where is Biscuit?', giver: 'mira',
    stages: [
      "Mira's cat Biscuit wandered off. Cats love the quiet of Mosswood North...",
      'You found Biscuit! Bring her home to Mira in Lantern Plaza.',
      'Biscuit is home, purring on the windowsill.',
    ],
  },
  {
    id: 'honey', title: 'Honeycap Pie', giver: 'bun', need: 3,
    stages: [
      'Bun the baker needs 3 golden honeycap mushrooms. They grow in the woods and hills.',
      'You have 3 honeycaps. Bring them to Bun in Lantern Plaza.',
      'Bun baked the best pie in Lanternwood.',
    ],
  },
  {
    id: 'race', title: "Hazel's Dash", giver: 'hazel',
    stages: [
      'Race Hazel from Wren\'s Lane to the flag in Mosswood North before time runs out.',
      'You beat Hazel! She still says it was a tie.',
    ],
  },
  {
    id: 'fish', title: 'Lake Shimmer Fishing', giver: 'gill', need: 3,
    stages: [
      'Catch 3 fish from the dock at Lake Shimmer North for Gill.',
      'Show your 3 fish to Gill.',
      'Gill is very impressed with your fishing.',
    ],
  },
  {
    id: 'riddle', title: "The Owl's Riddle", giver: 'owl',
    stages: [
      "Hoo the owl has a riddle for you at Owl's Perch.",
      'You solved the riddle. Hoo-ray!',
    ],
  },
  {
    id: 'lamps', title: 'Light the Way', giver: 'wick', need: 5,
    stages: [
      'Light the 5 old lamp posts around Lanternwood with your lantern.',
      'All 5 lamps are glowing. Tell Grandma Wick!',
      'The old lamp posts shine every night now.',
    ],
  },
];

export const QUEST = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

// Events that count toward a quest whether or not it has been accepted.
const COUNTERS = { honeycap: 'honey', 'fish:catch': 'fish', lamp: 'lamps' };

// from: stage required (-1 = not started). to: new stage. need: count needed
// (checked after every event, so collecting early still counts).
export const TRANSITIONS = [
  { q: 'main', from: 0, on: 'talk:wick', to: 1 },
  { q: 'main', from: 1, on: 'shard:burrow', to: 2 },
  { q: 'main', from: 2, on: 'shard:temple', to: 3 },
  { q: 'main', from: 3, on: 'shard:peak', to: 4 },
  { q: 'main', from: 4, on: 'lantern:lit', to: 5 },

  { q: 'cat', from: -1, on: 'accept:cat', to: 0 },
  { q: 'cat', from: -1, on: 'found:cat', to: 1 },
  { q: 'cat', from: 0, on: 'found:cat', to: 1 },
  { q: 'cat', from: 1, on: 'talk:mira', to: 2, reward: ['heart'] },

  { q: 'honey', from: -1, on: 'accept:honey', to: 0 },
  { q: 'honey', from: 0, need: 3, to: 1 },
  { q: 'honey', from: 1, on: 'talk:bun', to: 2, reward: ['berries:40', 'tea'] },

  { q: 'race', from: -1, on: 'accept:race', to: 0 },
  { q: 'race', from: 0, on: 'race:win', to: 1, reward: ['berries:60', 'pouch'] },

  { q: 'fish', from: -1, on: 'accept:fish', to: 0 },
  { q: 'fish', from: 0, need: 3, to: 1 },
  { q: 'fish', from: 1, on: 'talk:gill', to: 2, reward: ['heart'] },

  { q: 'riddle', from: -1, on: 'accept:riddle', to: 0 },
  { q: 'riddle', from: 0, on: 'riddle:correct', to: 1, reward: ['heart'] },

  { q: 'lamps', from: -1, on: 'accept:lamps', to: 0 },
  { q: 'lamps', from: 0, need: 5, to: 1 },
  { q: 'lamps', from: 1, on: 'talk:wick', to: 2, reward: ['heart'] },
];

export function newQuestState() {
  const s = {};
  for (const q of QUESTS) s[q.id] = { stage: -1, count: 0 };
  s.main.stage = 0;
  return s;
}

export const stageOf = (state, id) => (state[id] ? state[id].stage : -1);
export const isDone = (state, id) => stageOf(state, id) >= QUEST[id].stages.length - 1;

/**
 * Feed one event to the quest machine. Mutates `state` and returns
 * { changed: [questIds], rewards: [...] }. Unknown or out-of-order events do
 * nothing.
 */
export function questEvent(state, event) {
  const changed = [];
  const rewards = [];
  const counted = COUNTERS[event];
  if (counted && state[counted] && !isDone(state, counted)) {
    state[counted].count += 1;
    if (stageOf(state, counted) >= 0) changed.push(counted);
  }
  const fire = (t) => {
    const q = state[t.q];
    q.stage = t.to;
    if (!changed.includes(t.q)) changed.push(t.q);
    if (t.reward) rewards.push(...t.reward);
  };
  // At most one step per quest for each event.
  const stepped = new Set();
  for (const t of TRANSITIONS) {
    if (t.on === event && !stepped.has(t.q) && stageOf(state, t.q) === t.from) { stepped.add(t.q); fire(t); }
  }
  // Counter quests: advance as soon as enough have been collected.
  for (const t of TRANSITIONS) {
    if (t.need && stageOf(state, t.q) === t.from && state[t.q].count >= t.need) fire(t);
  }
  return { changed, rewards };
}

/** Lines for the quest log: active quests first, then finished ones. */
export function questLog(state) {
  const out = [];
  for (const q of QUESTS) {
    const st = state[q.id];
    if (!st || st.stage < 0) continue;
    const done = st.stage >= q.stages.length - 1;
    let text = q.stages[st.stage];
    if (q.need && st.stage === 0) text += ` (${Math.min(st.count, q.need)}/${q.need})`;
    out.push({ id: q.id, title: q.title, text, done, main: !!q.main });
  }
  return out.sort((a, b) => (a.done - b.done) || (b.main - a.main));
}
