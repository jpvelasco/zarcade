// Every collectible thing on the mountain. `size` is its height in cm,
// `w` its width as a fraction of the height. `peak` is where it first shows
// up (0-2). `waves` things keep waving from inside the snowball.
// DOM-free: the museum, the levels and the simulation all read this.

export const ITEMS = [
  { id: 'pinecone', name: 'Pinecone', size: 8, w: 0.75, peak: 0, blurb: 'Crunchy, and it smells like a forest.' },
  { id: 'cocoa', name: 'Cocoa Mug', size: 10, w: 1.1, peak: 0, blurb: 'Still warm! Marshmallows included.' },
  { id: 'mitten', name: 'Mitten', size: 12, w: 0.8, peak: 0, blurb: 'Someone will want this back. Probably.' },
  { id: 'snowglobe', name: 'Snow Globe', size: 12, w: 0.85, peak: 0, blurb: 'A tiny mountain inside a tiny mountain.', rare: true },
  { id: 'cardinal', name: 'Cardinal', size: 13, w: 1.05, peak: 0, waves: true, blurb: 'Bright red and loves a ride.' },
  { id: 'carrot', name: 'Carrot', size: 15, w: 0.55, peak: 0, blurb: 'A snowman nose looking for a face.' },
  { id: 'bunny', name: 'Snow Bunny', size: 22, w: 0.9, peak: 0, waves: true, blurb: 'Hops in, waves hello.' },
  { id: 'lantern', name: 'Lantern', size: 28, w: 0.6, peak: 0, blurb: 'Keeps the path cosy after dark.' },
  { id: 'candycane', name: 'Candy Cane', size: 32, w: 0.5, peak: 0, blurb: 'Peppermint striped and extra hooky.' },
  { id: 'penguin', name: 'Penguin', size: 30, w: 0.75, peak: 0, waves: true, blurb: 'Waves cheerfully from inside the ball.' },
  { id: 'sapling', name: 'Little Pine', size: 60, w: 0.7, peak: 0, blurb: 'Will be a big tree one day.' },
  { id: 'husky', name: 'Husky Pup', size: 65, w: 1.3, peak: 1, waves: true, blurb: 'Fluffy, fast and very waggy.' },
  { id: 'snowman', name: 'Snowman', size: 100, w: 0.7, peak: 0, waves: true, blurb: 'A snowball that already made it.' },
  { id: 'sled', name: 'Red Sled', size: 60, w: 1.9, peak: 1, blurb: 'Zoom! Now it rides with you.' },
  { id: 'mailbox', name: 'Mailbox', size: 120, w: 0.55, peak: 1, blurb: 'Letters to the North Pole inside.' },
  { id: 'skis', name: 'Skis', size: 150, w: 0.5, peak: 1, blurb: 'Two planks of pure speed.' },
  { id: 'reindeer', name: 'Reindeer', size: 160, w: 1.1, peak: 1, waves: true, blurb: 'Practising for a big night.' },
  { id: 'conecart', name: 'Snow Cone Cart', size: 170, w: 1.2, peak: 1, blurb: 'Free cones for every snowball.' },
  { id: 'snowmobile', name: 'Snowmobile', size: 140, w: 1.7, peak: 1, blurb: 'Vroom, but very politely.' },
  { id: 'igloo', name: 'Igloo', size: 220, w: 1.6, peak: 1, blurb: 'Cosy inside. Cosier inside a snowball.' },
  { id: 'pinetree', name: 'Pine Tree', size: 420, w: 0.6, peak: 2, blurb: 'Tall, green and full of birds.' },
  { id: 'polarbear', name: 'Polar Bear', size: 260, w: 1.6, peak: 2, waves: true, blurb: 'Gives the best bear hugs.' },
  { id: 'yeti', name: 'Friendly Yeti', size: 360, w: 0.8, peak: 2, waves: true, blurb: 'Shy, kind, and bigger than you think.' },
  { id: 'gondola', name: 'Gondola', size: 320, w: 1.1, peak: 2, blurb: 'Goes up the mountain. Now goes down.' },
  { id: 'cabin', name: 'Log Cabin', size: 560, w: 1.35, peak: 2, blurb: 'Smoke from the chimney, cocoa on the stove.' },
  { id: 'giantsnowman', name: 'Giant Snowman', size: 760, w: 0.7, peak: 2, waves: true, blurb: 'Built by the whole village.' },
  { id: 'balloon', name: 'Hot Air Balloon', size: 900, w: 0.75, peak: 2, blurb: 'Parked for a snack break.' },
  { id: 'lodge', name: 'Ski Lodge', size: 1100, w: 1.7, peak: 2, blurb: 'Fireplace, bunk beds, and a big bell.' },
  { id: 'clocktower', name: 'Clock Tower', size: 1500, w: 0.45, peak: 2, blurb: 'Always on time, even upside down.' },
  { id: 'icecastle', name: 'Ice Castle', size: 1900, w: 1.3, peak: 2, blurb: 'The sparkliest thing on the mountain.' },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((it, i) => [it.id, { ...it, index: i }]));

// A thing sticks to the ball when it is at most this fraction of the ball's
// diameter; up to BUMP_RATIO it is an obstacle (jumpable); anything bigger is scenery.
export const PICK_RATIO = 0.55;
export const BUMP_RATIO = 1.4;

export function interaction(itemSize, ballDiameter) {
  if (itemSize <= ballDiameter * PICK_RATIO) return 'pick';
  if (itemSize <= ballDiameter * BUMP_RATIO) return 'bump';
  return 'scenery';
}

// Display a diameter in cm as friendly text.
export function formatSize(cm) {
  if (cm < 100) return `${Math.floor(cm)} cm`;
  const m = cm / 100;
  return `${m < 10 ? m.toFixed(2) : m.toFixed(1)} m`;
}
