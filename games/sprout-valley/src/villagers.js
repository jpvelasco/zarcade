// Villager rules: friendship, gifts, dialogue and where everyone is. DOM-free.
import { VILLAGERS, VILLAGER_IDS, ITEMS, FESTIVALS, HEART_POINTS, MAX_HEARTS, SEASON_NAMES } from './data.js';
import { rngFor } from './rng.js';

export const TALK_POINTS = 20;
export const GIFT_POINTS = { love: 80, like: 45, neutral: 20, dislike: 0 };

export function newVillagerState() {
  const out = {};
  for (const id of VILLAGER_IDS) out[id] = { points: 0, met: false, talked: false, gifted: false, known: {} };
  return out;
}

export const heartsOf = (points) => Math.min(MAX_HEARTS, Math.floor(points / HEART_POINTS));

export function reactionTo(villagerId, itemId) {
  const v = VILLAGERS[villagerId];
  if (v.loves.includes(itemId)) return 'love';
  if (v.likes.includes(itemId)) return 'like';
  if (v.dislikes.includes(itemId)) return 'dislike';
  return 'neutral';
}

const REACTION_LINES = {
  love: ['Oh my goodness, {item}! I love it!', 'For me? {item} is my absolute favorite!', '{item}! You remembered! Thank you!'],
  like: ['{item}? How lovely, thank you!', 'Ooh, {item}. That is very kind.', 'Thanks! I like {item}.'],
  neutral: ['Thank you, that is sweet of you.', 'Oh, {item}. Thanks!', 'How thoughtful. Thank you.'],
  dislike: ['Oh... {item}. Um, thanks anyway.', 'That is... very kind. I will find a use for it.'],
};

// Give a gift: returns { reaction, points, line } or null if already gifted today.
export function giveGift(state, villagerId, itemId, dayIndex) {
  const s = state[villagerId];
  if (s.gifted) return null;
  const reaction = reactionTo(villagerId, itemId);
  const points = GIFT_POINTS[reaction];
  s.points = Math.min(MAX_HEARTS * HEART_POINTS, s.points + points);
  s.gifted = true;
  s.met = true;
  s.known[itemId] = reaction;
  const lines = REACTION_LINES[reaction];
  const line = lines[rngFor(dayIndex, villagerId, itemId)() * lines.length | 0].replace('{item}', ITEMS[itemId].name);
  return { reaction, points, line };
}

// Talking once a day builds friendship. Returns the line to show.
export function talk(state, villagerId, ctx) {
  const s = state[villagerId];
  const v = VILLAGERS[villagerId];
  const first = !s.met;
  let gained = 0;
  if (!s.talked) { s.points = Math.min(MAX_HEARTS * HEART_POINTS, s.points + TALK_POINTS); s.talked = true; gained = TALK_POINTS; }
  s.met = true;
  return { line: lineFor(villagerId, s, ctx, first), gained, first, name: v.name };
}

function lineFor(id, s, { dayIndex, season, weather, festival, minute, talkCount = 0 }, first) {
  const v = VILLAGERS[id];
  if (first) return v.intro;
  const rand = rngFor(dayIndex, id, talkCount);
  if (festival) {
    const f = FESTIVALS[festival];
    return rand() < 0.5 ? `Isn't the ${f.name} wonderful? ${f.desc}` : `Happy ${f.name}! I'm so glad you came.`;
  }
  const hearts = heartsOf(s.points);
  const pool = v.lines.slice();
  if (weather === 'rain') pool.push('Listen to that rain! Your crops are getting a free drink today.');
  if (weather === 'snow') pool.push('Snow! Everything looks like it is wrapped in cotton.');
  if (minute >= 20 * 60) pool.push('It is getting late. Don\'t stay up too long, farmer!');
  pool.push(`${SEASON_NAMES[season]} is such a nice time of year in the valley.`);
  if (hearts >= 3) for (const w of v.warm) pool.push(w, w);
  return pool[Math.floor(rand() * pool.length)];
}

// Where a villager wants to be: a spot name, or 'home:<id>' (indoors).
export function scheduleSpot(villagerId, minute, weather, festival) {
  if (festival) {
    const f = FESTIVALS[festival];
    if (minute >= f.start - 60 && minute < f.end) return festival === 'lanterns' || festival === 'snow' ? 'townpond' : 'plaza';
  }
  const v = VILLAGERS[villagerId];
  const list = weather === 'rain' || weather === 'snow' ? v.rainSchedule : v.schedule;
  let spot = list[0][1];
  for (const [t, s] of list) if (minute >= t) spot = s;
  return spot;
}

export const isHome = (spot) => spot.startsWith('home:');

// Day rollover: talk and gift flags reset.
export function newDay(state) {
  for (const id of VILLAGER_IDS) { state[id].talked = false; state[id].gifted = false; }
}

export function bestHearts(state) {
  return Math.max(0, ...VILLAGER_IDS.map((id) => heartsOf(state[id].points)));
}
