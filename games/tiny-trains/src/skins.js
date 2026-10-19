// Collectible locomotive skins and their unlock rules. DOM-free.
// A skin changes the engine's shape and trim; the body colour always stays
// the train's route colour so play stays readable.

export const SKINS = [
  { key: 'puffer', name: 'Little Puffer', blurb: 'The classic steam engine.', rule: { stars: 0 } },
  { key: 'bullet', name: 'Zoom Bullet', blurb: 'A sleek, speedy nose.', rule: { stars: 12 } },
  { key: 'wooden', name: 'Woodie', blurb: 'Hand-painted wooden blocks.', rule: { world: 0 } },
  { key: 'ladybug', name: 'Ladybug Line', blurb: 'Round, spotty and lucky.', rule: { world: 1 } },
  { key: 'duck', name: 'Quack Express', blurb: 'Waddles to every station.', rule: { dailies: 1 } },
  { key: 'rocket', name: 'Rocket Rail', blurb: 'Fins, flames and a big whoosh.', rule: { stars: 45 } },
  { key: 'tinker', name: 'Tinker Bot', blurb: 'Built in the sandbox.', rule: { sandbox: 1 } },
  { key: 'whale', name: 'Whale Wagon', blurb: 'Spouts steam from its blowhole.', rule: { world: 3 } },
  { key: 'dragon', name: 'Puff the Dragon', blurb: 'Spiky, friendly and warm.', rule: { stars: 90 } },
  { key: 'moon', name: 'Moon Express', blurb: 'A crescent for night runs.', rule: { world: 5 } },
  { key: 'gold', name: 'Golden Star', blurb: 'For a three-day streak.', rule: { streak: 3 } },
  { key: 'rainbow', name: 'Rainbow Royal', blurb: 'Every star in the arcade.', rule: { stars: 144 } },
];

export const skinByKey = (key) => SKINS.find((s) => s.key === key) || SKINS[0];

export function ruleText(rule, worldNames = []) {
  if (rule.stars) return `Earn ${rule.stars} ★`;
  if (rule.world !== undefined) return `Finish ${worldNames[rule.world] || `world ${rule.world + 1}`}`;
  if (rule.dailies) return rule.dailies === 1 ? 'Solve a Daily Delivery' : `Solve ${rule.dailies} Daily Deliveries`;
  if (rule.streak) return `${rule.streak}-day daily streak`;
  if (rule.sandbox) return 'Run a train in the sandbox';
  return 'Free!';
}

// progress: { stars, worldsDone: Set|array of world indexes, dailies, bestStreak, sandboxRuns }
export function isUnlocked(skin, progress) {
  const r = skin.rule;
  if (r.stars !== undefined && (progress.stars || 0) < r.stars) return false;
  if (r.world !== undefined && !new Set(progress.worldsDone || []).has(r.world)) return false;
  if (r.dailies && (progress.dailies || 0) < r.dailies) return false;
  if (r.streak && (progress.bestStreak || 0) < r.streak) return false;
  if (r.sandbox && (progress.sandboxRuns || 0) < r.sandbox) return false;
  return true;
}

export const unlockedSkins = (progress) => SKINS.filter((s) => isUnlocked(s, progress)).map((s) => s.key);
