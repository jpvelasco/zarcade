// Items from the rainbow item boxes. Kid-friendly and readable: nothing
// stops a kart dead, a hit is a short wobble. Odds lean toward the strong
// items the further back a racer is.
import { clamp, weightedPick } from './math.js';

export const ITEMS = {
  shield: { id: 'shield', name: 'Bubble Shield', icon: '🫧', uses: 1, tip: 'Blocks one hit' },
  star: { id: 'star', name: 'Bouncy Star', icon: '⭐', uses: 1, tip: 'Drop it behind you' },
  mushroom: { id: 'mushroom', name: 'Turbo Mushroom', icon: '🍄', uses: 1, tip: 'A quick boost' },
  triple: { id: 'triple', name: 'Triple Turbo', icon: '🍄', uses: 3, tip: 'Three boosts' },
  jelly: { id: 'jelly', name: 'Homing Jelly', icon: '🪼', uses: 1, tip: 'Chases the racer ahead' },
  comet: { id: 'comet', name: 'Comet Ride', icon: '☄️', uses: 1, tip: 'Zoom ahead on autopilot' },
};
export const ITEM_IDS = Object.keys(ITEMS);

export const SHIELD_TIME = 10;
export const MUSHROOM = { time: 1.2, mul: 1.38 };
export const COMET_TIME = 2.6;
export const JELLY = { speed: 430, life: 7, radius: 10, homeRange: 170 };
export const STAR = { radius: 12, life: 30, safe: 0.7 };
export const ROLL_TIME = 1.0;
export const BOX_RESPAWN = 2.2;

// Weights at the front, middle and back of the pack.
const FRONT = { shield: 34, star: 44, mushroom: 16, triple: 0, jelly: 6, comet: 0 };
const MIDDLE = { shield: 16, star: 18, mushroom: 30, triple: 6, jelly: 30, comet: 0 };
const BACK = { shield: 6, star: 4, mushroom: 22, triple: 32, jelly: 22, comet: 14 };

// How far back a racer counts as: 0 is the leader, 1 the very back. Being
// far behind the leader pushes it further toward 1.
export function packPosition(place, count, gapToLeader, lapLength) {
  const byPlace = count > 1 ? (place - 1) / (count - 1) : 0;
  const byGap = clamp(gapToLeader / (lapLength * 0.3), 0, 1);
  return clamp(byPlace + byGap * 0.3, 0, 1);
}

export function itemWeights(t) {
  const [a, b, u] = t < 0.5 ? [FRONT, MIDDLE, t / 0.5] : [MIDDLE, BACK, (t - 0.5) / 0.5];
  return ITEM_IDS.map((id) => a[id] + (b[id] - a[id]) * u);
}

export function rollItem(t, r) {
  return ITEM_IDS[weightedPick(itemWeights(t), r)];
}

// Expected "strength" of a roll, used by tests to show last place does
// better than first.
export const ITEM_POWER = { shield: 1, star: 1, mushroom: 2, triple: 4, jelly: 3, comet: 5 };
export function expectedPower(t) {
  const w = itemWeights(t);
  const total = w.reduce((a, b) => a + b, 0);
  return ITEM_IDS.reduce((sum, id, i) => sum + (w[i] / total) * ITEM_POWER[id], 0);
}
