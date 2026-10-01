// What the hangar holds: folds, papers and the stamp album. Pure data plus the
// rules for what is unlocked. The renderer reads the colours; the save code
// reads the ids.

/**
 * Six folds. Every multiplier sits inside ±12 % so no fold is a trap and none
 * is required: they change the feel, not the outcome.
 */
export const FOLDS = [
  {
    id: 'dart', name: 'Classic Dart', blurb: 'The fold everybody knows. Steady and honest.',
    liftScale: 1, dragScale: 1, diveScale: 1, soakResist: 1, snapScale: 1,
    shape: 'dart', need: null,
  },
  {
    id: 'glider', name: 'Wide Glider', blurb: 'Big wings. Floats forever, hates a hurry.',
    liftScale: 1.1, dragScale: 1.08, diveScale: 0.94, soakResist: 1, snapScale: 0.95,
    shape: 'glider', need: { kind: 'stars', count: 9, label: '9 stars' },
  },
  {
    id: 'arrow', name: 'Needle Arrow', blurb: 'Slim and quick. Sinks, but gets there.',
    liftScale: 0.93, dragScale: 0.9, diveScale: 1.08, soakResist: 1.05, snapScale: 1.05,
    shape: 'arrow', need: { kind: 'letters', count: 40, label: '40 letters' },
  },
  {
    id: 'crane', name: 'Paper Crane', blurb: 'Folded for luck. Snaps out of a dive beautifully.',
    liftScale: 1.04, dragScale: 1.02, diveScale: 1, soakResist: 1, snapScale: 1.22,
    shape: 'crane', need: { kind: 'snaps', count: 60, label: '60 dive snaps' },
  },
  {
    id: 'hawk', name: 'Night Hawk', blurb: 'Swept wings. Dives like it means it.',
    liftScale: 0.98, dragScale: 0.95, diveScale: 1.1, soakResist: 1, snapScale: 1.1,
    shape: 'hawk', need: { kind: 'routes', count: 24, label: '24 routes delivered' },
  },
  {
    id: 'sunray', name: 'Sunray', blurb: 'Waxed and warm. Rain rolls straight off.',
    liftScale: 1.06, dragScale: 0.98, diveScale: 1, soakResist: 1.9, snapScale: 1.05,
    shape: 'sunray', need: { kind: 'stamps', count: 18, label: '18 stamps' },
  },
];

/** Twelve papers. Mostly looks, with a nudge of feel. */
export const PAPERS = [
  { id: 'cream', name: 'Cream', ink: '#fff6e6', trim: '#f2d8a8', accent: '#e9b06a', soakResist: 1, need: null },
  { id: 'lined', name: 'Notebook', ink: '#f4f9ff', trim: '#b9d6f2', accent: '#7fb2e6', soakResist: 1, need: null },
  { id: 'grid', name: 'Graph', ink: '#eefcf2', trim: '#aee3c0', accent: '#6fcf97', soakResist: 1, need: { kind: 'letters', count: 8, label: '8 letters' } },
  { id: 'peach', name: 'Peach Blush', ink: '#fff0ea', trim: '#ffc7ae', accent: '#ff9f7d', liftScale: 1.01, need: { kind: 'stars', count: 6, label: '6 stars' } },
  { id: 'polka', name: 'Polka', ink: '#fff7fb', trim: '#ffc6e2', accent: '#ff8ec4', need: { kind: 'rings', count: 40, label: '40 rings' } },
  { id: 'sky', name: 'Sky Blue', ink: '#eaf6ff', trim: '#a9d8ff', accent: '#5fb4f5', dragScale: 0.99, need: { kind: 'routes', count: 10, label: '10 routes' } },
  { id: 'leaf', name: 'Pressed Leaf', ink: '#f2fbe8', trim: '#bfe59a', accent: '#86c552', need: { kind: 'stamps', count: 6, label: '6 stamps' } },
  { id: 'map', name: 'Old Map', ink: '#fbf0d8', trim: '#dcc08a', accent: '#b98f4f', need: { kind: 'distance', count: 1500, label: '1500 m in Endless' } },
  { id: 'waxed', name: 'Waxed Brown', ink: '#f6e3c8', trim: '#d9ab74', accent: '#a8763c', soakResist: 1.5, need: { kind: 'soft', count: 20, label: '20 feather landings' } },
  { id: 'candy', name: 'Candy Stripe', ink: '#fff3f3', trim: '#ffb3b8', accent: '#ff7a85', need: { kind: 'snaps', count: 120, label: '120 dive snaps' } },
  { id: 'aurora', name: 'Aurora', ink: '#eef0ff', trim: '#b9b4ff', accent: '#8f7bff', liftScale: 1.02, dragScale: 0.99, need: { kind: 'daily', count: 5, label: '5 Daily Breezes' } },
  { id: 'gold', name: 'Gold Leaf', ink: '#fff6cf', trim: '#f0c860', accent: '#d79a1c', liftScale: 1.03, soakResist: 1.2, sparkle: true, need: { kind: 'stars', count: 100, label: '100 stars' } },
];

/**
 * Thirty stamps for the album. `kind` names a lifetime counter and `need` the
 * amount; the album draws a silhouette for anything not earned yet.
 */
export const STAMPS = [
  { id: 'first-post', name: 'First Post', art: 'letter', kind: 'letters', need: 1, blurb: 'Your very first letter through a window.' },
  { id: 'ten-letters', name: 'Ten Little Notes', art: 'letter', kind: 'letters', need: 10, blurb: 'Ten letters delivered.' },
  { id: 'fifty-letters', name: 'Busy Satchel', art: 'satchel', kind: 'letters', need: 50, blurb: 'Fifty letters delivered.' },
  { id: 'two-hundred', name: 'Round the Valley', art: 'satchel', kind: 'letters', need: 200, blurb: 'Two hundred letters delivered.' },
  { id: 'five-hundred', name: 'Postmaster', art: 'crown', kind: 'letters', need: 500, blurb: 'Five hundred letters. Remarkable.' },

  { id: 'route-1', name: 'Off the Roof', art: 'roof', kind: 'routes', need: 1, blurb: 'Finish your first route.' },
  { id: 'route-9', name: 'Oakhollow Regular', art: 'house', kind: 'routes', need: 9, blurb: 'Nine routes delivered.' },
  { id: 'route-20', name: 'Valley Courier', art: 'map', kind: 'routes', need: 20, blurb: 'Twenty routes delivered.' },
  { id: 'route-35', name: 'Long Hauler', art: 'map', kind: 'routes', need: 35, blurb: 'Thirty-five routes delivered.' },
  { id: 'route-45', name: 'Every Door', art: 'crown', kind: 'routes', need: 45, blurb: 'Every route in the valley.' },

  { id: 'stars-10', name: 'Bright Start', art: 'star', kind: 'stars', need: 10, blurb: 'Ten stars.' },
  { id: 'stars-40', name: 'Starry Satchel', art: 'star', kind: 'stars', need: 40, blurb: 'Forty stars.' },
  { id: 'stars-80', name: 'Constellation', art: 'star', kind: 'stars', need: 80, blurb: 'Eighty stars.' },
  { id: 'stars-135', name: 'Full Sky', art: 'crown', kind: 'stars', need: 135, blurb: 'Every star on every route.' },

  { id: 'rings-10', name: 'Through the Hoop', art: 'ring', kind: 'rings', need: 10, blurb: 'Ten rings threaded.' },
  { id: 'rings-60', name: 'Ribbon Runner', art: 'ring', kind: 'rings', need: 60, blurb: 'Sixty rings threaded.' },
  { id: 'rings-200', name: 'Ring Collector', art: 'ring', kind: 'rings', need: 200, blurb: 'Two hundred rings threaded.' },

  { id: 'snap-1', name: 'Crisp Fold', art: 'snap', kind: 'snaps', need: 1, blurb: 'Your first dive snap.' },
  { id: 'snap-30', name: 'Snap Happy', art: 'snap', kind: 'snaps', need: 30, blurb: 'Thirty dive snaps.' },
  { id: 'snap-150', name: 'Origami Master', art: 'snap', kind: 'snaps', need: 150, blurb: 'A hundred and fifty dive snaps.' },

  { id: 'soft-1', name: 'Feather Touch', art: 'feather', kind: 'soft', need: 1, blurb: 'One feather landing.' },
  { id: 'soft-15', name: 'Soft Hands', art: 'feather', kind: 'soft', need: 15, blurb: 'Fifteen feather landings.' },
  { id: 'soft-45', name: 'Never a Crease', art: 'feather', kind: 'soft', need: 45, blurb: 'Forty-five feather landings.' },

  { id: 'thermal-25', name: 'Thermal Rider', art: 'thermal', kind: 'thermals', need: 25, blurb: 'Climb 25 warm columns.' },
  { id: 'thermal-120', name: 'Chimney Sweep', art: 'thermal', kind: 'thermals', need: 120, blurb: 'Climb 120 warm columns.' },

  { id: 'dist-800', name: 'Long Breeze', art: 'cloud', kind: 'distance', need: 800, blurb: '800 m in Endless Breeze.' },
  { id: 'dist-2000', name: 'Far Horizon', art: 'cloud', kind: 'distance', need: 2000, blurb: '2000 m in Endless Breeze.' },
  { id: 'dist-4000', name: 'Over the Pass', art: 'mountain', kind: 'distance', need: 4000, blurb: '4000 m in Endless Breeze.' },

  { id: 'daily-1', name: 'Morning Round', art: 'sun', kind: 'daily', need: 1, blurb: 'Finish one Daily Breeze goal.' },
  { id: 'daily-7', name: 'Seven Sunrises', art: 'sun', kind: 'daily', need: 7, blurb: 'Seven Daily Breeze goals.' },
];

export const foldById = (id) => FOLDS.find((fold) => fold.id === id) || FOLDS[0];
export const paperById = (id) => PAPERS.find((paper) => paper.id === id) || PAPERS[0];

/** True when a `{ kind, count }` requirement is met by the lifetime stats. */
export function meetsNeed(need, stats) {
  if (!need) return true;
  return (stats[need.kind] || 0) >= need.count;
}

export function unlockedFolds(stats) {
  return FOLDS.filter((fold) => meetsNeed(fold.need, stats));
}

export function unlockedPapers(stats) {
  return PAPERS.filter((paper) => meetsNeed(paper.need, stats));
}

export function earnedStamps(stats) {
  return STAMPS.filter((stamp) => (stats[stamp.kind] || 0) >= stamp.need).map((stamp) => stamp.id);
}

/** The next thing to chase: the closest unearned stamp. */
export function nextStamp(stats) {
  let best = null;
  for (const stamp of STAMPS) {
    const have = stats[stamp.kind] || 0;
    if (have >= stamp.need) continue;
    const left = stamp.need - have;
    if (!best || left < best.left) best = { stamp, left, have };
  }
  return best;
}
