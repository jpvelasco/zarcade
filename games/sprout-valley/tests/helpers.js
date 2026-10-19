// Shared test helpers: drive a World through the same controls the page uses.
import { World } from '../src/world.js';
import { FarmerBot } from '../src/bot.js';

export function freshWorld(seed = 1) {
  const w = new World({ seed });
  w.events.length = 0;
  return w;
}

// Stand the farmer on a tile facing a direction.
export function standAt(w, x, y, dir = 'down') {
  w.player.x = x + 0.5;
  w.player.y = y + 0.5;
  w.player.dir = dir;
  w.player.busy = 0;
}

// Select a belt slot holding `id` (a tool or item) and use the facing tile.
export function useOn(w, id, x, y) {
  let slot = w.belt.indexOf(id);
  if (slot < 0) { w.setBelt(5, id); slot = w.belt.indexOf(id); }
  w.player.busy = 0;
  w.step(0.001, { slot, target: [x, y] });
  w.player.busy = 0;
}

export function takeEvents(w) {
  const e = w.events.slice();
  w.events.length = 0;
  return e;
}

// Run the bot for `days` days. Returns nightly summaries.
export function runBot(w, days, opts) {
  const bot = new FarmerBot(w, opts);
  const nights = [];
  const end = w.day + days;
  let steps = 0;
  while (w.day < end && steps < 2e6) {
    w.step(0.05, bot.controls(0.05));
    bot.handleEvents(w.events);
    w.events.length = 0;
    if (bot.lastSummary) { nights.push({ ...bot.lastSummary, money: w.money }); bot.lastSummary = null; }
    steps++;
  }
  return nights;
}
