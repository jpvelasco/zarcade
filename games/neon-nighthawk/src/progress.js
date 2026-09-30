export const SAVE_KEY = 'neon-nighthawk.v1';

export const UPGRADES = {
  fins: {
    label: 'Vector fins',
    blurb: 'Sharper drifts build charge faster.',
    costs: [180, 390, 680],
  },
  quiet: {
    label: 'Quiet core',
    blurb: 'Scanners fill more slowly and heat cools faster.',
    costs: [210, 450, 760],
  },
  echo: {
    label: 'Echo projector',
    blurb: 'Longer decoys pull patrols farther off route.',
    costs: [240, 510, 860],
  },
  flux: {
    label: 'Flux shield',
    blurb: 'Start each contract with collision protection.',
    costs: [190, 420, 720],
  },
  clamps: {
    label: 'Mag clamps',
    blurb: 'Dashes hit harder and recover charge sooner.',
    costs: [220, 470, 790],
  },
};

export const PAINTS = [
  { id: 'cyan', label: 'Nighthawk cyan', color: '#3fe5ff' },
  { id: 'rose', label: 'Electric rose', color: '#ff5fb7' },
  { id: 'gold', label: 'Sunset gold', color: '#ffc857' },
  { id: 'violet', label: 'Infra violet', color: '#c775ff' },
  { id: 'mint', label: 'Signal mint', color: '#6df0bd' },
];

export function defaultSave() {
  return {
    credits: 0,
    bestScore: 0,
    bestContracts: 0,
    upgrades: { fins: 0, quiet: 0, echo: 0, flux: 0, clamps: 0 },
    paint: 'cyan',
    muted: false,
    // Story progress: stars per job (0–3) for each chapter, and the highest
    // chapter the player may start.
    story: { unlocked: 0, stars: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], finished: false },
  };
}

export function loadSave(storage) {
  try {
    const raw = JSON.parse(storage.getItem(SAVE_KEY));
    const base = defaultSave();
    if (!raw) return base;
    return {
      ...base,
      ...raw,
      upgrades: { ...base.upgrades, ...(raw.upgrades || {}) },
      story: cleanStory(raw.story, base.story),
    };
  } catch {
    return defaultSave();
  }
}

function cleanStory(raw, base) {
  if (!raw || typeof raw !== 'object') return base;
  const stars = base.stars.map((row, chapter) => row.map((_, job) => {
    const value = raw.stars?.[chapter]?.[job];
    return Number.isInteger(value) ? Math.max(0, Math.min(3, value)) : 0;
  }));
  const unlocked = Number.isInteger(raw.unlocked) ? Math.max(0, Math.min(base.stars.length - 1, raw.unlocked)) : 0;
  return { unlocked, stars, finished: raw.finished === true };
}

export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Local storage can be unavailable in privacy modes. The current session
    // still works when saving is not possible.
  }
}

export function statsFor(upgrades = {}) {
  const fins = upgrades.fins || 0;
  const quiet = upgrades.quiet || 0;
  const echo = upgrades.echo || 0;
  const flux = upgrades.flux || 0;
  const clamps = upgrades.clamps || 0;
  return {
    cruise: 285 + clamps * 8,
    dashSpeed: 690 + clamps * 28,
    maxCharge: 100 + fins * 10,
    driftGain: 1 + fins * 0.2,
    scanResistance: 1 - quiet * 0.13,
    coolRate: 2.9 + quiet * 0.55,
    echoDuration: 1.85 + echo * 0.42,
    echoPull: 1 + echo * 0.35,
    flux: 1 + flux,
    dashCost: Math.max(17, 25 - clamps * 2),
    pulseRadius: 165 + clamps * 18,
  };
}

export function upgradeCost(save, key) {
  const upgrade = UPGRADES[key];
  if (!upgrade) return null;
  const level = save.upgrades[key] || 0;
  return level >= upgrade.costs.length ? null : upgrade.costs[level];
}

export function buyUpgrade(save, key) {
  const cost = upgradeCost(save, key);
  if (cost === null || save.credits < cost) return false;
  save.credits -= cost;
  save.upgrades[key]++;
  return true;
}

export function paintFor(save) {
  return PAINTS.find((paint) => paint.id === save.paint) || PAINTS[0];
}

export function recordDelivery(save, result) {
  save.credits += result.earned;
  save.bestScore = Math.max(save.bestScore, result.shiftTotal);
  save.bestContracts = Math.max(save.bestContracts, result.contractsDone);
}

export function recordJob(save, chapter, job, stars) {
  const row = save.story.stars[chapter];
  if (!row) return;
  row[job] = Math.max(row[job] || 0, stars);
}

// Finishing a chapter unlocks the next one; the last one finishes the story.
export function recordChapter(save, chapter) {
  const last = save.story.stars.length - 1;
  if (chapter >= last) save.story.finished = true;
  save.story.unlocked = Math.max(save.story.unlocked, Math.min(last, chapter + 1));
}

export function chapterStars(save, chapter) {
  return (save.story.stars[chapter] || []).reduce((sum, value) => sum + value, 0);
}
