// The sea critters you rescue. Colors are used by the sprite painter.
export const CRITTERS = {
  clownfish: { name: 'Clownfish', body: '#ff8a2a', accent: '#ffffff', size: 1, swim: 'fish' },
  starfish: { name: 'Starfish', body: '#ff6f91', accent: '#ffc2d1', size: 1, swim: 'crawl' },
  seahorse: { name: 'Seahorse', body: '#ffc23d', accent: '#ff9a3d', size: 1, swim: 'bob' },
  turtle: { name: 'Sea turtle', body: '#5cc98a', accent: '#2f8f6a', size: 1.3, swim: 'fish' },
  angelfish: { name: 'Angelfish', body: '#ffe066', accent: '#3d7bff', size: 1, swim: 'fish' },
  pufferfish: { name: 'Pufferfish', body: '#f7d774', accent: '#c99a3a', size: 1, swim: 'bob' },
  octopus: { name: 'Octopus', body: '#b46cff', accent: '#e3c2ff', size: 1.2, swim: 'bob' },
  ray: { name: 'Spotted ray', body: '#6aa7d8', accent: '#cfe6ff', size: 1.4, swim: 'glide' },
  jellyfish: { name: 'Jellyfish', body: '#ff9ce6', accent: '#ffe0f6', size: 1, swim: 'bob' },
  dolphin: { name: 'Dolphin', body: '#7fa8c9', accent: '#d8ecf7', size: 1.5, swim: 'fish' },
  narwhal: { name: 'Narwhal', body: '#9fb3e8', accent: '#fff6d8', size: 1.5, swim: 'fish' },
  whale: { name: 'Baby whale', body: '#4c74c9', accent: '#cfe0ff', size: 1.8, swim: 'glide' },
};

export const CRITTER_IDS = Object.keys(CRITTERS);

// Up to `cap` swimmers for the aquarium, spread across the species you own,
// in a stable order.
export function aquariumRoster(collection, cap = 24) {
  const owned = CRITTER_IDS.filter((id) => (collection[id] | 0) > 0);
  if (!owned.length) return [];
  const total = owned.reduce((n, id) => n + (collection[id] | 0), 0);
  const roster = [];
  for (const id of owned) {
    const share = Math.max(1, Math.round(((collection[id] | 0) / total) * cap));
    for (let i = 0; i < Math.min(share, collection[id] | 0); i++) roster.push(id);
  }
  // Trim the biggest groups first so every species keeps at least one.
  while (roster.length > cap) {
    const counts = {};
    for (const id of roster) counts[id] = (counts[id] || 0) + 1;
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    roster.splice(roster.lastIndexOf(top), 1);
  }
  return roster;
}
