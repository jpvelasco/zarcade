// Sea creatures for the encyclopedia: real animals with one true, kid-sized
// fact each. DOM-free; spawns are placed deterministically on the map.
//
// shape   how the sprite is drawn (see sprites.js)
// beh     school | wander | still | drift | hide | shy | curious
// spot    where it lives: water (default) | floor | surface
// size    body length in world pixels
import { AREA_INDEX as A } from './areas.js';
import { CELL, ROCK, WATER, kindAt } from './map.js';
import { AREA_STAGE, isClear, reachAtStage } from './gating.js';
import { mulberry32, hashString } from './rng.js';

const C = (id, name, area, shape, beh, size, c1, c2, fact, more = {}) => ({ id, name, area, shape, beh, size, c1, c2, fact, count: 1, spot: 'water', pattern: 'plain', glow: false, ...more });

export const SPECIES = [
  // Sunny Shallows
  C('clownfish', 'Clownfish', A.shallows, 'fish', 'wander', 30, '#ff8a2a', '#ffffff', 'Clownfish live inside stinging sea anemones. A slimy coat keeps them from getting stung!', { pattern: 'bands', count: 3 }),
  C('anemone', 'Sea Anemone', A.shallows, 'anemone', 'still', 40, '#ff6fa8', '#ffd0e4', 'Anemones look like flowers, but they are animals that catch food with sticky, stinging arms.', { spot: 'floor', count: 3 }),
  C('blue-tang', 'Blue Tang', A.shallows, 'tallfish', 'school', 34, '#2f7bff', '#ffd23f', 'Blue tangs have a sharp spine near their tail, like a tiny pocketknife!', { count: 6 }),
  C('green-turtle', 'Green Sea Turtle', A.shallows, 'turtle', 'wander', 70, '#6aa84f', '#c9a15a', 'Green sea turtles can hold their breath for hours while they nap underwater.', { count: 2 }),
  C('sea-star', 'Sea Star', A.shallows, 'star', 'still', 30, '#ff7a3d', '#ffc28a', 'A sea star can grow back a lost arm. Some can even grow a whole new body from one arm!', { spot: 'floor', count: 3 }),
  C('hermit-crab', 'Hermit Crab', A.shallows, 'crab', 'still', 28, '#e2553b', '#f3d39a', 'Hermit crabs move into bigger shells as they grow, like moving to a new house.', { spot: 'floor', count: 2, pattern: 'shell' }),
  C('dolphin', 'Bottlenose Dolphin', A.shallows, 'dolphin', 'curious', 90, '#8fa6bf', '#dfe8f2', 'Dolphins call each other with their own special whistles, a bit like names.', { count: 2 }),
  C('pufferfish', 'Pufferfish', A.shallows, 'puffer', 'shy', 32, '#e8c65a', '#fff3c4', 'A pufferfish gulps water to puff up into a spiky ball that is too big to bite.', { pattern: 'spots', count: 2 }),
  C('sergeant-major', 'Sergeant Major', A.shallows, 'fish', 'school', 26, '#f5e15a', '#2b2b2b', 'Sergeant major fish wear stripes like an army uniform, which is how they got their name.', { pattern: 'stripes', count: 6 }),

  // Kelp Forest
  C('sea-otter', 'Sea Otter', A.kelp, 'otter', 'curious', 56, '#8a5a3a', '#e8cfa8', 'Sea otters hold hands while they sleep so they do not drift apart.', { spot: 'surface', count: 2 }),
  C('garibaldi', 'Garibaldi', A.kelp, 'fish', 'wander', 32, '#ff7b1c', '#ffb066', 'Garibaldi are bright orange fish that guard their homes by making loud thumping sounds.', { count: 3 }),
  C('harbor-seal', 'Harbor Seal', A.kelp, 'seal', 'curious', 70, '#9c9a92', '#5f5d57', 'Harbor seals can nap underwater and pop up to breathe without even waking up.', { pattern: 'spots', count: 2 }),
  C('sea-urchin', 'Purple Sea Urchin', A.kelp, 'urchin', 'still', 26, '#7b3fa8', '#c08ae0', 'Sea urchins walk on hundreds of tiny tube feet hidden between their spines.', { spot: 'floor', count: 4 }),
  C('seadragon', 'Leafy Seadragon', A.kelp, 'seahorse', 'hide', 40, '#9cc95a', '#e0b84a', 'Leafy seadragons look just like floating seaweed, so they hide in plain sight.', { pattern: 'leafy', count: 2 }),
  C('sardine', 'Sardine', A.kelp, 'fish', 'school', 20, '#b8cbe0', '#5a7a9c', 'Sardines swim in huge schools. Thousands turn together like one giant fish!', { count: 9 }),
  C('bat-ray', 'Bat Ray', A.kelp, 'ray', 'wander', 70, '#4a4f5a', '#a9b0bd', 'Bat rays flap their fins like wings and seem to fly through the water.', { count: 2 }),
  C('sheephead', 'California Sheephead', A.kelp, 'fish', 'wander', 44, '#e05a6a', '#2b2b33', 'California sheephead start life as girls and can later change into boys.', { pattern: 'saddle', count: 2 }),
  C('nudibranch', 'Spanish Shawl Nudibranch', A.kelp, 'slug', 'still', 26, '#a04ad8', '#ff8a2a', 'Nudibranchs are sea slugs that wear bright colors to say "I taste yucky!"', { spot: 'floor', count: 3 }),

  // Shipwreck
  C('moray', 'Moray Eel', A.wreck, 'eel', 'shy', 70, '#5d8a3a', '#c9d65a', 'Moray eels open and close their mouths all the time. They are not being rude, they are breathing!', { pattern: 'spots', count: 2 }),
  C('grouper', 'Goliath Grouper', A.wreck, 'fish', 'wander', 90, '#8a6a4a', '#c9a77a', 'Goliath groupers can weigh as much as a piano and live for more than 30 years.', { pattern: 'spots', count: 1 }),
  C('lionfish', 'Lionfish', A.wreck, 'lionfish', 'wander', 40, '#c9442f', '#fff1e0', 'Lionfish have frilly, striped fins with stinging spines, so most fish leave them alone.', { pattern: 'stripes', count: 2 }),
  C('octopus', 'Common Octopus', A.wreck, 'octopus', 'hide', 46, '#d0603f', '#f2a07a', 'An octopus has three hearts and blue blood, and it can change color in a blink.', { count: 2 }),
  C('spiny-lobster', 'Spiny Lobster', A.wreck, 'lobster', 'still', 44, '#c4572f', '#f2c27a', 'Spiny lobsters march across the sea floor in long single-file lines.', { spot: 'floor', count: 2 }),
  C('barracuda', 'Barracuda', A.wreck, 'longfish', 'wander', 70, '#b8c4cc', '#3d4a55', 'Barracudas can zoom faster than 40 kilometers per hour in short bursts.', { pattern: 'bars', count: 2 }),
  C('cleaner-shrimp', 'Cleaner Shrimp', A.wreck, 'shrimp', 'still', 22, '#ff4a4a', '#ffffff', 'Cleaner shrimp run a cleaning station: fish line up to get their teeth picked clean!', { spot: 'floor', count: 3 }),
  C('glassy-sweeper', 'Glassy Sweeper', A.wreck, 'tallfish', 'school', 20, '#e0a060', '#ffd9a8', 'Glassy sweepers hide in shipwrecks by day and come out to eat at night.', { count: 7 }),

  // Coral City
  C('parrotfish', 'Parrotfish', A.coral, 'fish', 'wander', 46, '#3fd0a0', '#ff7eb6', 'Parrotfish crunch on coral, and their poop turns into white sandy beaches!', { pattern: 'scales', count: 3 }),
  C('brain-coral', 'Brain Coral', A.coral, 'brain', 'still', 44, '#d9a65a', '#a8703a', 'Brain coral is built by thousands of tiny animals called polyps.', { spot: 'floor', count: 3 }),
  C('seahorse', 'Seahorse', A.coral, 'seahorse', 'still', 30, '#ffc23f', '#ff8a2a', 'Seahorse dads carry the eggs in a pouch until the babies hatch.', { count: 3 }),
  C('mandarinfish', 'Mandarinfish', A.coral, 'fish', 'shy', 24, '#2f8aff', '#ff8a2a', 'Mandarinfish are one of the very few animals that are colored true blue.', { pattern: 'swirl', count: 2 }),
  C('reef-shark', 'Blacktip Reef Shark', A.coral, 'shark', 'wander', 110, '#8a9aa8', '#e8edf2', 'Sharks have been swimming in the sea since before the dinosaurs.', { count: 1 }),
  C('giant-clam', 'Giant Clam', A.coral, 'clam', 'still', 46, '#4ab8c9', '#9be8f0', 'Giant clams can weigh more than a grown-up and live over 100 years.', { spot: 'floor', count: 2 }),
  C('moorish-idol', 'Moorish Idol', A.coral, 'idol', 'school', 30, '#f5f0e0', '#1e1e1e', 'Moorish idols have a long, flowing fin that trails behind them like a ribbon.', { pattern: 'bands', count: 5 }),
  C('cuttlefish', 'Cuttlefish', A.coral, 'squid', 'hide', 46, '#b07ad0', '#f0d0ff', 'Cuttlefish can flash rippling waves of color across their skin.', { count: 2 }),
  C('manta', 'Manta Ray', A.coral, 'ray', 'wander', 120, '#2b3245', '#f2f4f8', 'Manta rays have one of the biggest brains of any fish.', { count: 1 }),

  // Twilight Zone
  C('lanternfish', 'Lanternfish', A.twilight, 'fish', 'school', 20, '#4a5a7a', '#8affff', 'Lanternfish have glowing spots that work like tiny flashlights.', { glow: true, pattern: 'dots', count: 8 }),
  C('hatchetfish', 'Hatchetfish', A.twilight, 'hatchet', 'school', 20, '#c9d6e8', '#8affd0', 'Hatchetfish have glowing bellies that hide their shadow from hunters below.', { glow: true, count: 6 }),
  C('moon-jelly', 'Moon Jelly', A.twilight, 'jelly', 'drift', 40, '#c9d8ff', '#ffffff', 'Jellyfish have no brain, heart or bones, and they have lived in the sea for 500 million years.', { glow: true, count: 4 }),
  C('swordfish', 'Swordfish', A.twilight, 'sword', 'wander', 100, '#4a5f8a', '#c9d6e8', 'Swordfish warm up their eyes so they can see better in cold, dark water.', { count: 1 }),
  C('sperm-whale', 'Sperm Whale', A.twilight, 'whale', 'wander', 220, '#4f5560', '#7a808c', 'Sperm whales dive more than a mile deep to hunt squid, all on one big breath.', { count: 1 }),
  C('giant-squid', 'Giant Squid', A.twilight, 'squid', 'shy', 130, '#c9503f', '#f08a6a', 'The giant squid has eyes as big as dinner plates, among the biggest of any animal.', { count: 1 }),
  C('comb-jelly', 'Comb Jelly', A.twilight, 'comb', 'drift', 30, '#e0f0ff', '#ff6fd8', 'Comb jellies shimmer with rainbow colors as tiny hairs ripple along their bodies.', { glow: true, count: 3 }),
  C('vampire-squid', 'Vampire Squid', A.twilight, 'octopus', 'hide', 40, '#8a1f3a', '#ff5a7a', 'The vampire squid can flip its webbed arms over its body like a cape to hide.', { glow: true, count: 1 }),

  // Glowing Trenches
  C('anglerfish', 'Anglerfish', A.trench, 'angler', 'shy', 50, '#3a3048', '#5ef2d0', 'Anglerfish dangle a glowing lure in front of their mouths to catch a snack.', { glow: true, count: 2 }),
  C('dumbo-octopus', 'Dumbo Octopus', A.trench, 'dumbo', 'drift', 40, '#ffb0c4', '#ffe0ea', 'Dumbo octopuses flap fins that look like elephant ears.', { count: 2 }),
  C('gulper-eel', 'Gulper Eel', A.trench, 'gulper', 'shy', 80, '#22202e', '#ff5ab0', 'Gulper eels have a mouth so big it can swallow animals almost as big as themselves.', { glow: true, count: 1 }),
  C('sea-pig', 'Sea Pig', A.trench, 'seapig', 'still', 34, '#ffa8c0', '#ffd8e4', 'Sea pigs are sea cucumbers that walk on little legs across the deep sea floor.', { spot: 'floor', count: 3 }),
  C('barreleye', 'Barreleye Fish', A.trench, 'barreleye', 'shy', 34, '#5a6a7a', '#7affb0', 'The barreleye fish has a see-through head, and its eyes look up through it!', { glow: true, count: 1 }),
  C('giant-isopod', 'Giant Isopod', A.trench, 'isopod', 'still', 40, '#c9b8a8', '#8a7a6a', 'Giant isopods are cousins of garden pill bugs, but they grow longer than a ruler.', { spot: 'floor', count: 2 }),
  C('firefly-squid', 'Firefly Squid', A.trench, 'squid', 'school', 22, '#3a6aff', '#8ad8ff', 'Firefly squid sparkle with blue lights, and they can make a whole bay glow.', { glow: true, count: 6 }),
  C('atolla', 'Atolla Jelly', A.trench, 'jelly', 'drift', 40, '#d02f4a', '#5aa8ff', 'When scared, the atolla jelly flashes a ring of blue lights like a burglar alarm.', { glow: true, count: 3 }),

  // Volcanic Vent
  C('tube-worm', 'Giant Tube Worm', A.vent, 'tubeworm', 'still', 50, '#f2f0e8', '#ff3b3b', 'Giant tube worms have no mouth or tummy. Tiny bacteria inside them make their food.', { spot: 'floor', count: 4 }),
  C('yeti-crab', 'Yeti Crab', A.vent, 'crab', 'still', 34, '#f2ede0', '#d8cdb8', 'Yeti crabs have hairy arms where they grow bacteria to eat.', { spot: 'floor', pattern: 'hairy', count: 2 }),
  C('vent-shrimp', 'Vent Shrimp', A.vent, 'shrimp', 'school', 20, '#f2e8e0', '#ffb08a', 'Some vent shrimp have a special eye on their back that senses the glow of hot vents.', { count: 6 }),
  C('pompeii-worm', 'Pompeii Worm', A.vent, 'worm', 'still', 34, '#ff7a6a', '#f0e8d8', 'Pompeii worms live on super hot vent chimneys and wear a fuzzy coat of bacteria like a blanket.', { spot: 'floor', count: 3 }),
  C('eelpout', 'Vent Eelpout', A.vent, 'eel', 'wander', 60, '#e8c8b8', '#b08a7a', 'Eelpouts are fish that live near hot vents and munch on vent snails and shrimp.', { count: 2 }),
  C('scaly-snail', 'Scaly-foot Snail', A.vent, 'snail', 'still', 26, '#3a3a40', '#8a8a96', 'The scaly-foot snail has a shell made with iron, like a tiny suit of armor!', { spot: 'floor', count: 3 }),
  C('vent-octopus', 'Vent Octopus', A.vent, 'octopus', 'hide', 42, '#f0ece8', '#c9c0c8', 'Vent octopuses are ghostly white, because in the dark deep sea color is not needed.', { count: 1 }),
  C('ghost-shark', 'Ghost Shark', A.vent, 'chimaera', 'wander', 80, '#b8c0d0', '#e8ecf4', 'Ghost sharks are not really sharks. Their family split off from sharks 400 million years ago.', { count: 1 }),
];

export const SPECIES_INDEX = Object.fromEntries(SPECIES.map((s, i) => [s.id, i]));

export function speciesInArea(area) {
  return SPECIES.filter((s) => s.area === area);
}

// Deterministic spawn points: each individual gets a roomy cell in its area
// that is reachable at the stage when that area opens.
export function placeCreatures(map, seed = 1) {
  const out = [];
  const byArea = new Map();
  const candidates = (area, spot) => {
    const key = `${area}:${spot}`;
    if (byArea.has(key)) return byArea.get(key);
    const reach = reachAtStage(map, AREA_STAGE[area]);
    const cells = [];
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const i = y * map.cols + x;
        if (!reach[i] || map.area[i] !== area || !isClear(map, x, y)) continue;
        if (map.currents.some((c) => x >= c.x - 1 && x < c.x + c.w + 1 && y >= c.y - 1 && y < c.y + c.h + 1)) continue;
        if (map.gates.some((g) => x >= g.x - 1 && x < g.x + g.w + 1 && y >= g.y - 1 && y < g.y + g.h + 1)) continue;
        if (spot === 'floor' && kindAt(map, x, y + 2) !== ROCK) continue;
        if (spot === 'floor' && kindAt(map, x, y + 1) !== WATER) continue;
        if (spot === 'surface' && y > 4) continue;
        cells.push({ x, y });
      }
    }
    byArea.set(key, cells);
    return cells;
  };
  SPECIES.forEach((sp, si) => {
    const rand = mulberry32(hashString(sp.id) ^ seed);
    const cells = candidates(sp.area, sp.spot);
    const group = sp.beh === 'school';
    let anchor = cells[Math.floor(rand() * cells.length)];
    for (let k = 0; k < sp.count; k++) {
      const cell = group ? anchor : cells[Math.floor(rand() * cells.length)];
      if (!group) anchor = cell;
      const jitter = group ? 40 : 0;
      const x = cell.x * CELL + CELL / 2 + (rand() - 0.5) * jitter;
      const y = sp.spot === 'floor' ? (cell.y + 2) * CELL - sp.size * 0.32 : cell.y * CELL + CELL / 2 + (rand() - 0.5) * jitter;
      out.push({ species: si, cell, x, y, homeX: x, homeY: y });
    }
  });
  return out;
}
