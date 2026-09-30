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
    };
  } catch {
    return defaultSave();
  }
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
