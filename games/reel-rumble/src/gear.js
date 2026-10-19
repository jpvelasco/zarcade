// Tackle, boats and the coin economy. Pure data and save mutations.
import { FISH, RARITY_INFO } from './data.js';

// cast: max cast distance (m). flex: how much of a tug the rod soaks up
// (lower is better). reelSpeed m/s, reelPower pull. strength: line limit.
export const RODS = [
  { id: 'twig', name: 'Willow Twig Rod', price: 0, cast: 20, flex: 1.0, blurb: 'Gill made it for you. Short casts.' },
  { id: 'bamboo', name: 'Bamboo Rod', price: 90, cast: 28, flex: 0.9, blurb: 'Springy and light. Casts farther.' },
  { id: 'fiberglass', name: 'Fiberglass Rod', price: 300, cast: 36, flex: 0.82, blurb: 'Reaches deep water. Bends nicely.' },
  { id: 'carbon', name: 'Carbon Rod', price: 800, cast: 46, flex: 0.72, blurb: 'Long casts and soaks up big tugs.' },
  { id: 'starlight', name: 'Starlight Rod', price: 1800, cast: 56, flex: 0.62, blurb: 'Sparkly! The best rod in the world.' },
];
export const REELS = [
  { id: 'clicker', name: 'Old Clicker Reel', price: 0, reelSpeed: 2.6, reelPower: 6, blurb: 'Click, click, click.' },
  { id: 'smooth', name: 'Smooth Spin Reel', price: 120, reelSpeed: 3.4, reelPower: 8, blurb: 'Reels in faster.' },
  { id: 'gearmaster', name: 'Gear Master Reel', price: 420, reelSpeed: 4.4, reelPower: 10, blurb: 'Strong gears for heavy fish.' },
  { id: 'tidal', name: 'Tidal Pro Reel', price: 1000, reelSpeed: 5.4, reelPower: 13, blurb: 'Fast as the tide.' },
];
export const LINES = [
  { id: 'cotton', name: 'Cotton Line', price: 0, strength: 6, blurb: 'Fine for little fish.' },
  { id: 'mono', name: 'Mono Line', price: 100, strength: 10, blurb: 'Clear and tougher.' },
  { id: 'braid', name: 'Braided Line', price: 400, strength: 16, blurb: 'Hard to snap.' },
  { id: 'silk', name: 'Dragon Silk Line', price: 1100, strength: 24, blurb: 'Strong enough for legends.' },
];
// Bait: which fish bite is listed on each fish. sink m/s, hook: bite window.
export const BAITS = [
  { id: 'worm', name: 'Wiggly Worm', price: 0, sink: 1.0, hook: 1.0, color: '#e88a8a', blurb: 'Pond and river fish love it.' },
  { id: 'cricket', name: 'Cricket', price: 25, sink: 0.9, hook: 1.0, color: '#6a8a3a', blurb: 'Crunchy snack for sunfish and trout.' },
  { id: 'dough', name: 'Dough Ball', price: 35, sink: 1.1, hook: 1.1, color: '#f2d9a0', blurb: 'Carp and koi can\'t resist.' },
  { id: 'minnow', name: 'Minnow Lure', price: 70, sink: 1.3, hook: 1.0, color: '#c8d8e0', blurb: 'For hungry hunters.' },
  { id: 'spinner', name: 'Spinner', price: 110, sink: 1.4, hook: 1.05, color: '#ffd84f', blurb: 'Flashy! Trout, pike and barracuda.' },
  { id: 'shrimp', name: 'Shrimp', price: 90, sink: 1.0, hook: 1.1, color: '#ff9a7a', blurb: 'Reef and lagoon favourite.' },
  { id: 'squid', name: 'Squid Strip', price: 150, sink: 1.3, hook: 1.0, color: '#f0e0f0', blurb: 'For snappers and morays.' },
  { id: 'feather', name: 'Feather Jig', price: 220, sink: 1.2, hook: 1.1, color: '#ff6ad8', blurb: 'Fast ocean fish chase it.' },
  { id: 'waxworm', name: 'Waxworm', price: 80, sink: 1.0, hook: 1.1, color: '#fff2c8', blurb: 'Ice fishing classic.' },
  { id: 'icejig', name: 'Ice Jig', price: 180, sink: 1.5, hook: 1.0, color: '#7ad8ff', blurb: 'Wiggles under the ice.' },
  { id: 'glowbead', name: 'Glow Bead', price: 200, sink: 0.9, hook: 1.1, color: '#5ef2ff', blurb: 'Glows for night lagoon fish.' },
  { id: 'starjig', name: 'Star Jig', price: 320, sink: 1.3, hook: 1.05, color: '#fff6a8', blurb: 'For the rarest lagoon fish.' },
  { id: 'starlight', name: 'Starlight Lure', price: 600, sink: 1.4, hook: 1.2, color: '#ffd84f', blurb: 'Only legends bite it.', needsSpecies: 10 },
];
export const BOATS = [
  { id: 'canoe', name: 'Red Canoe', price: 150, blurb: 'Paddle to the Rushing River.', water: 'river' },
  { id: 'sailboat', name: 'Little Sailboat', price: 450, blurb: 'Sail out to Coral Bay.', water: 'coral' },
  { id: 'snowrunner', name: 'Snow Runner', price: 900, blurb: 'Ice-sled to the Frozen Lake.', water: 'frozen' },
  { id: 'starferry', name: 'Star Ferry Ticket', price: 1500, blurb: 'A night ride to Starfall Lagoon.', water: 'lagoon' },
];
export const SLOTS = { rod: RODS, reel: REELS, line: LINES, bait: BAITS, boat: BOATS };
export const ITEM = {};
for (const [slot, list] of Object.entries(SLOTS)) for (const it of list) ITEM[`${slot}:${it.id}`] = { ...it, slot };

export const find = (slot, id) => SLOTS[slot].find((i) => i.id === id);

// The numbers the cast and fight use, from equipped gear.
export function gearStats(equip) {
  const rod = find('rod', equip.rod) || RODS[0];
  const reel = find('reel', equip.reel) || REELS[0];
  const line = find('line', equip.line) || LINES[0];
  const bait = find('bait', equip.bait) || BAITS[0];
  return {
    cast: rod.cast, flex: rod.flex, reelSpeed: reel.reelSpeed, reelPower: reel.reelPower,
    strength: line.strength, bait: bait.id, sink: bait.sink, hook: bait.hook,
  };
}

export const owns = (save, slot, id) => (save.owned[slot] || []).includes(id);
export const speciesCaught = (save) => Object.keys(save.book).filter((id) => save.book[id].n > 0).length;

// Why an item can't be bought right now, or null if it can.
export function buyBlock(save, slot, id) {
  const it = find(slot, id);
  if (!it) return 'Unknown item';
  if (owns(save, slot, id)) return 'Owned';
  if (it.needsSpecies && speciesCaught(save) < it.needsSpecies) return `Catch ${it.needsSpecies} species first`;
  if (save.coins < it.price) return 'Not enough coins';
  return null;
}

export function buy(save, slot, id) {
  if (buyBlock(save, slot, id)) return false;
  const it = find(slot, id);
  save.coins -= it.price;
  save.owned[slot] = [...(save.owned[slot] || []), id];
  if (slot !== 'boat') save.equip[slot] = id;
  return true;
}

export function equip(save, slot, id) {
  if (slot === 'boat' || !owns(save, slot, id)) return false;
  save.equip[slot] = id;
  return true;
}

export const canReach = (save, waterId, boatOf) => {
  const boat = boatOf(waterId);
  return !boat || owns(save, 'boat', boat);
};

// Coins for a catch: bigger fish of a species are worth more.
export const COIN_SCALE = 2;
export function fishValue(fish, t) {
  const mult = fish.rarity === 'legendary' ? 1 : 0.7 + 0.6 * t;
  return Math.max(1, Math.round(fish.value * mult * COIN_SCALE));
}

// Weakest gear that makes the fight fair: the line must hold the fish's
// biggest pull after the rod soaks some up. Used by tests and hints.
export function lineHolds(stats, fish) {
  return stats.flex * fish.power * 1.25 < 0.82 * stats.strength;
}

export const RARITY_ORDER = Object.keys(RARITY_INFO);
export const allBaitsFor = (fish) => fish.baits.map((b) => find('bait', b));
export const fishForBait = (baitId) => FISH.filter((f) => f.baits.includes(baitId));
