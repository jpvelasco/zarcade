// Keeper tasks: three short goals at a time, generated from a counter seed so
// the same zoo gets the same sequence. Progress comes from zoo events.
import { BIOMES, DECOS, PLOTS_PER_BIOME, MAX_LEVEL } from './data.js';
import { Rng, mix } from './rng.js';
import { niceRound, totalRate, buildCost } from './economy.js';

export const TASK_SLOTS = 3;

const TEMPLATES = {
  pet: { goals: [8, 12, 16], text: (g) => `Give ${g} pets`, icon: '💗' },
  snack: { goals: [2, 3, 4], text: (g) => `Serve ${g} snacks`, icon: '🍎' },
  hatch: { goals: [1, 2, 3], text: (g) => (g === 1 ? 'Hatch an egg' : `Hatch ${g} eggs`), icon: '🥚' },
  earn: { goals: null, text: (g, fmt) => `Earn ${fmt(g)} coins`, icon: '🪙' },
  visitors: { goals: [10, 15, 25], text: (g) => `Welcome ${g} visitors`, icon: '👋' },
  build: { goals: [1], text: () => 'Build a new habitat', icon: '🏗️' },
  upgrade: { goals: [1, 2], text: (g) => (g === 1 ? 'Upgrade a habitat' : `Upgrade habitats ${g} times`), icon: '⬆️' },
  deco: { goals: [1], text: () => 'Place a decoration', icon: '🌷' },
  biomeEgg: { goals: [1], text: (g, fmt, b) => `Hatch an egg in the ${BIOMES[b].name}`, icon: '🥚' },
};
export const TASK_TYPES = Object.keys(TEMPLATES);

export function taskText(task, fmt = String) {
  return TEMPLATES[task.type].text(task.goal, fmt, task.biome);
}
export const taskIcon = (task) => TEMPLATES[task.type].icon;

function eligible(type, state) {
  const unlocked = state.unlocked;
  if (type === 'build') {
    for (let b = 0; b < unlocked; b++) {
      for (let p = 0; p < PLOTS_PER_BIOME; p++) if (state.habitats[b * PLOTS_PER_BIOME + p].level === 0) return true;
    }
    return false;
  }
  if (type === 'upgrade') return state.habitats.some((h, i) => h.level > 0 && h.level < MAX_LEVEL && Math.floor(i / PLOTS_PER_BIOME) < unlocked);
  if (type === 'deco') {
    const owned = new Set(state.decos.owned);
    return DECOS.some((d) => !owned.has(d.id)) || state.decos.owned.length > Object.keys(state.decos.placed).length;
  }
  if (type === 'snack' || type === 'pet') return state.habitats.some((h) => h.animals.length > 0);
  if (type === 'biomeEgg') return unlocked > 1;
  return true;
}

// Make task number `n` for the current zoo, avoiding types already showing.
export function makeTask(state, n, taken = []) {
  const rng = new Rng(mix(state.seed, n * 7919 + 13));
  const types = TASK_TYPES.filter((t) => !taken.includes(t) && eligible(t, state));
  const type = types.length ? rng.pick(types) : 'pet';
  const t = TEMPLATES[type];
  const rate = totalRate(state, { joy: false });
  let goal = t.goals ? rng.pick(t.goals) : niceRound(Math.max(50, rate * 120));
  if (type === 'upgrade' && goal > 1 && !state.habitats.some((h) => h.level > 0 && h.level < MAX_LEVEL - 1)) goal = 1;
  const task = { n, type, goal, progress: 0 };
  if (type === 'biomeEgg') task.biome = rng.int(state.unlocked);
  // Every third task gives a gift egg; the rest give about 90 s of income.
  if (n % 3 === 2) task.reward = { egg: 1 };
  else task.reward = { coins: niceRound(Math.max(30, rate * 90, cheapestBuild(state) * 0.25)) };
  return task;
}

function cheapestBuild(state) {
  return buildCost(Math.max(0, state.unlocked - 1), 0);
}

export const taskDone = (task) => task.progress >= task.goal;

// Apply an event to the active tasks. Returns tasks that just completed.
export function bumpTasks(state, type, amount = 1, extra = {}) {
  const done = [];
  for (const task of state.tasks.list) {
    if (taskDone(task)) continue;
    let match = task.type === type;
    if (type === 'hatch' && task.type === 'biomeEgg') match = extra.biome === task.biome;
    if (!match) continue;
    task.progress = Math.min(task.goal, task.progress + amount);
    if (taskDone(task)) done.push(task);
  }
  return done;
}

export function fillTasks(state) {
  while (state.tasks.list.length < TASK_SLOTS) {
    const taken = state.tasks.list.map((t) => t.type);
    state.tasks.list.push(makeTask(state, state.tasks.counter++, taken));
  }
}
