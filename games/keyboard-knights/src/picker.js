// Chooses the next word for a monster. With adaptive picking on, words that
// use the player's weak keys come up more often. Seeded, so the same stats
// and seed give the same words.
import { weakness, weakKeys } from './stats.js';
import { baseKey } from './keys.js';

export function wordScore(word, keyStats, weak = []) {
  let sum = 0;
  let n = 0;
  let hasWeak = false;
  for (const ch of word) {
    if (ch === ' ') continue;
    const k = baseKey(ch);
    sum += weakness(keyStats, k);
    n++;
    if (weak.includes(k)) hasWeak = true;
  }
  return (n ? sum / n : 0) + (hasWeak ? 0.6 : 0);
}

export function createPicker({ pool, rng, keyStats = {}, adaptive = true, recent = 10 }) {
  const unique = [...new Set(pool)];
  const memory = Math.min(recent, Math.max(0, unique.length - 3));
  const used = [];
  const weak = adaptive ? weakKeys(keyStats) : [];
  // Scores depend only on stats taken at stage start, so cache them.
  const scores = new Map(unique.map((w) => [w, adaptive ? wordScore(w, keyStats, weak) : 0]));
  const first = (w) => w[0].toLowerCase();

  return {
    weak,
    next(avoidFirst = new Set()) {
      let options = unique.filter((w) => !used.includes(w) && !avoidFirst.has(first(w)));
      if (!options.length) options = unique.filter((w) => !avoidFirst.has(first(w)));
      if (!options.length) options = unique.filter((w) => !used.includes(w));
      if (!options.length) options = unique;
      // Weight = 1 + 4 x score: weak-key words are a few times likelier,
      // and everything stays possible.
      const weights = options.map((w) => 1 + 4 * scores.get(w));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = rng() * total;
      let choice = options[options.length - 1];
      for (let i = 0; i < options.length; i++) {
        r -= weights[i];
        if (r < 0) { choice = options[i]; break; }
      }
      used.push(choice);
      while (used.length > memory) used.shift();
      return choice;
    },
  };
}
