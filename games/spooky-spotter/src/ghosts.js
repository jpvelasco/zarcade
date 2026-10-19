// The residents of Hollowhush Manor. Nine shy, friendly ghosts: each lives in
// one room, has one treasured thing it always asks for first, and brightens up
// in the album once you have returned something of theirs. DOM-free.

export const GHOSTS = [
  {
    id: 'lumi', name: 'Lumi', room: 'library', hue: '#c9a8f0', glow: '#efe0ff',
    title: 'the librarian',
    favourite: 'spectacles',
    bio: 'Keeps every book in order and can never find her spectacles. Reads to the others on stormy nights.',
    line: 'Oh! You found them. Now I can read the small print again.',
    shape: 'tall',
  },
  {
    id: 'pib', name: 'Pib', room: 'library', hue: '#9fd2ff', glow: '#e2f3ff',
    title: 'the bookworm',
    favourite: 'marble',
    bio: 'Sleeps between the atlas pages. Collects marbles and rolls them down the banisters.',
    line: 'My best marble! It rolls further than all the others.',
    shape: 'round',
  },
  {
    id: 'pudding', name: 'Mrs Pudding', room: 'kitchen', hue: '#ffc88f', glow: '#fff0d8',
    title: 'the cook',
    favourite: 'teacup',
    bio: 'Bakes for nobody in particular and everybody in general. Her teacup has one tiny chip she is fond of.',
    line: 'Bless you. Tea tastes wrong in any other cup.',
    shape: 'wide',
  },
  {
    id: 'tatters', name: 'Tatters', room: 'attic', hue: '#ffd0e4', glow: '#fff0f7',
    title: 'the littlest ghost',
    favourite: 'teddy',
    bio: 'The smallest resident. Hides when the house creaks, which is often. Teddy helps.',
    line: 'Teddy! I told him you would come.',
    shape: 'small',
  },
  {
    id: 'dot', name: 'Dot', room: 'attic', hue: '#b9f0d8', glow: '#e6fff5',
    title: 'the keeper of boxes',
    favourite: 'key',
    bio: 'Knows what is in every box and labels them all, then loses the labels.',
    line: 'That opens the blue trunk. Probably. Let us find out.',
    shape: 'round',
  },
  {
    id: 'moss', name: 'Moss', room: 'greenhouse', hue: '#aee89a', glow: '#eaffdf',
    title: 'the gardener',
    favourite: 'mitten',
    bio: 'Talks to the ferns and swears they answer. Only ever has one mitten at a time.',
    line: 'A pair at last. The seedlings will be so pleased.',
    shape: 'tall',
  },
  {
    id: 'twirl', name: 'Twirl', room: 'ballroom', hue: '#ffa8cf', glow: '#ffe4f1',
    title: 'the dancer',
    favourite: 'sock',
    bio: 'Has waltzed every night for a hundred years. Cannot dance with cold toes.',
    line: 'Both socks! Quick, hold the gramophone steady.',
    shape: 'wide',
  },
  {
    id: 'jam', name: 'Jam', room: 'cellar', hue: '#f2a0a8', glow: '#ffe6e8',
    title: 'the jam maker',
    favourite: 'jamjar',
    bio: 'Fills the cellar with strawberry jam nobody can eat. Smells wonderful anyway.',
    line: 'The last jar of the summer. Perfect.',
    shape: 'round',
  },
  {
    id: 'nocta', name: 'Nocta', room: 'observatory', hue: '#a6c0ff', glow: '#e4ecff',
    title: 'the stargazer',
    favourite: 'pocketwatch',
    bio: 'Counts the stars every night and gets a slightly different answer. Needs her watch for the timing.',
    line: 'Now I can time the meteors again. Thank you, spotter.',
    shape: 'tall',
  },
];

export const GHOST = Object.fromEntries(GHOSTS.map((g) => [g.id, g]));

export function ghostsOf(roomId) {
  return GHOSTS.filter((g) => g.room === roomId);
}

// Spread the room's wanted items over its ghosts, favourite first, so the item
// list can show whose thing is whose.
export function assignOwners(roomId, itemIds) {
  const crew = ghostsOf(roomId);
  if (!crew.length) return itemIds.map(() => null);
  const owners = new Array(itemIds.length).fill(null);
  const taken = new Set();
  for (const g of crew) {
    const i = itemIds.indexOf(g.favourite);
    if (i >= 0 && !taken.has(i)) { owners[i] = g.id; taken.add(i); }
  }
  let turn = 0;
  for (let i = 0; i < itemIds.length; i++) {
    if (owners[i]) continue;
    owners[i] = crew[turn % crew.length].id;
    turn++;
  }
  return owners;
}
