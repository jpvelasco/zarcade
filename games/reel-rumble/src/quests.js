// Grandpa Gill's quests and tournaments. Pure: they read the save and the
// latest catch.
import { FISH, fishOfWater } from './data.js';

const caughtIn = (save, water) => fishOfWater(water).filter((f) => save.book[f.id]?.n > 0).length;
const legendsCaught = (save) => FISH.filter((f) => f.rarity === 'legendary' && save.book[f.id]?.n > 0).length;
const species = (save) => Object.values(save.book).filter((e) => e.n > 0).length;
const heaviest = (save) => Math.max(0, ...Object.values(save.book).map((e) => e.kg));

// progress(save) -> [have, need]. `event(ctx)` quests finish on a single
// catch: ctx = { result, water, period, weather }.
export const QUESTS = [
  { id: 'first', title: 'First Nibble', text: 'Catch any fish. Hold to cast, tap when the bobber dives!', reward: 20, progress: (s) => [Math.min(1, s.stats.caught), 1] },
  { id: 'pond4', title: 'Pond Sampler', text: 'Catch 4 different fish at Willow Pond.', reward: 60, after: 'first', progress: (s) => [caughtIn(s, 'pond'), 4] },
  { id: 'night', title: 'Night Owl', text: 'Catch a fish at night. Use the ⏳ Wait button to pass the time.', reward: 50, after: 'first', event: (c) => c.period === 'night' },
  { id: 'big', title: 'A Big One', text: 'Land a fish that weighs 2 kg or more.', reward: 100, after: 'pond4', progress: (s) => [Math.min(2, heaviest(s)), 2] },
  { id: 'river5', title: 'River Rambler', text: 'Catch 5 different fish at the Rushing River.', reward: 150, after: 'pond4', progress: (s) => [caughtIn(s, 'river'), 5] },
  { id: 'rain', title: 'Singing in the Rain', text: 'Catch a fish while it is raining.', reward: 60, after: 'pond4', event: (c) => c.weather === 'rain' },
  { id: 'species12', title: 'Book Worm', text: 'Fill in 12 pages of your collection book.', reward: 200, after: 'river5', progress: (s) => [species(s), 12] },
  { id: 'coral5', title: 'Reef Rainbow', text: 'Catch 5 different fish at Coral Bay.', reward: 250, after: 'river5', progress: (s) => [caughtIn(s, 'coral'), 5] },
  { id: 'frozen5', title: 'Ice Breaker', text: 'Catch 5 different fish at the Frozen Lake.', reward: 300, after: 'coral5', progress: (s) => [caughtIn(s, 'frozen'), 5] },
  { id: 'legend1', title: 'Legend Seeker', text: 'Catch a legendary fish. Ask the book where and when they swim!', reward: 400, after: 'species12', progress: (s) => [Math.min(1, legendsCaught(s)), 1] },
  { id: 'lagoon5', title: 'Starfall Wish', text: 'Catch 5 different fish at Starfall Lagoon.', reward: 400, after: 'frozen5', progress: (s) => [caughtIn(s, 'lagoon'), 5] },
  { id: 'legend5', title: 'Grand Angler', text: 'Catch all five legendary fish.', reward: 1500, after: 'legend1', progress: (s) => [legendsCaught(s), 5] },
];
export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export const questOpen = (save, q) => !save.quests.includes(q.id) && (!q.after || save.quests.includes(q.after));
export const openQuests = (save) => QUESTS.filter((q) => questOpen(save, q));

export function questProgress(save, q) {
  if (save.quests.includes(q.id)) return [1, 1];
  if (q.event) return [0, 1];
  return q.progress(save);
}

// Finish every open quest that is now complete; pays the rewards. Repeats
// so a chain of quests completed by one catch all count.
export function settleQuests(save, ctx = null) {
  const done = [];
  for (let again = true; again;) {
    again = false;
    for (const q of openQuests(save)) {
      const ok = q.event ? !!(ctx && q.event(ctx)) : (() => { const [h, n] = q.progress(save); return h >= n; })();
      if (!ok) continue;
      save.quests.push(q.id);
      save.coins += q.reward;
      done.push(q);
      again = true;
    }
  }
  return done;
}

// ------------------------------------------------------------ tournaments

export const TOURNAMENT_FISH = 5;
export const TOURNAMENTS = [
  { id: 'pondDerby', name: 'Willow Pond Derby', water: 'pond', needs: 'pond4', rivals: [['Lil\' Minnow', 1], ['Auntie Reed', 3.5], ['Captain Kip', 8]], prizes: { bronze: 40, silver: 90, gold: 180 } },
  { id: 'riverRace', name: 'Rapids Roundup', water: 'river', needs: 'river5', rivals: [['Lil\' Minnow', 2.5], ['Auntie Reed', 7], ['Captain Kip', 14]], prizes: { bronze: 80, silver: 160, gold: 320 } },
  { id: 'coralCup', name: 'Coral Cup', water: 'coral', needs: 'coral5', rivals: [['Lil\' Minnow', 3], ['Auntie Reed', 10], ['Captain Kip', 24]], prizes: { bronze: 120, silver: 240, gold: 480 } },
  { id: 'frostyClassic', name: 'Frosty Classic', water: 'frozen', needs: 'frozen5', rivals: [['Lil\' Minnow', 2], ['Auntie Reed', 7], ['Captain Kip', 16]], prizes: { bronze: 150, silver: 300, gold: 600 } },
];
export const TOURNAMENT_BY_ID = Object.fromEntries(TOURNAMENTS.map((t) => [t.id, t]));
export const tournamentOpen = (save, t) => save.quests.includes(t.needs);

const MEDALS = ['bronze', 'silver', 'gold'];
export const medalRank = (m) => MEDALS.indexOf(m);

export function newTournament(t) {
  return { id: t.id, fish: 0, kg: 0, catches: [] };
}

// Count one hooked fish (landed or lost). Returns true when it's over.
export function tournamentCount(run, result) {
  run.fish++;
  if (result && !result.lost) {
    run.kg = Math.round((run.kg + result.kg) * 100) / 100;
    run.catches.push({ id: result.fish.id, kg: result.kg });
  }
  return run.fish >= TOURNAMENT_FISH;
}

// Final standings and the medal (null if every rival beat you).
export function tournamentResult(t, kg) {
  const table = [...t.rivals.map(([name, w]) => ({ name, kg: w })), { name: 'You', kg, you: true }]
    .sort((a, b) => b.kg - a.kg || (a.you ? -1 : 1));
  const place = table.findIndex((r) => r.you);
  const beaten = t.rivals.filter(([, w]) => kg >= w).length;
  const medal = beaten === 0 ? null : MEDALS[beaten - 1];
  return { table, place, medal, prize: medal ? t.prizes[medal] : 0 };
}

// Store the medal if it's better than before; prize only for an upgrade.
export function awardMedal(save, t, res) {
  if (!res.medal) return 0;
  const prev = save.medals[t.id];
  if (prev && medalRank(prev) >= medalRank(res.medal)) return 0;
  save.medals[t.id] = res.medal;
  const paid = prev ? t.prizes[prev] : 0;
  const gain = res.prize - paid;
  save.coins += gain;
  return gain;
}
