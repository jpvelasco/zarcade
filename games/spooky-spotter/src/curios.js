// The curio cabinet: twenty-four odd little treasures the ghosts give you for
// clearing rooms, plus three secrets for spotting the manor mouse. DOM-free.

export const CURIOS = [
  // shelf 0 — library and kitchen
  { id: 'bookmark', name: 'Brass bookmark', shelf: 0, art: 'bookmark', tint: '#e3b256', blurb: 'Lumi pressed a fern in it, long ago.', earn: { kind: 'clear', room: 'library', mode: 'find' } },
  { id: 'inkpot', name: 'Starlight ink', shelf: 0, art: 'inkpot', tint: '#5f6ddd', blurb: 'Writes in a faint shimmer. Dreadful for homework.', earn: { kind: 'clear', room: 'library', mode: 'diff' } },
  { id: 'readcandle', name: 'Reading candle', shelf: 0, art: 'candleStub', tint: '#ffe6a8', blurb: 'Never burns down, never sets a book alight.', earn: { kind: 'clear', room: 'library', mode: 'hunt' } },
  { id: 'whisk', name: 'Copper whisk', shelf: 0, art: 'whisk', tint: '#d98a4a', blurb: 'Hums a little tune while it whisks.', earn: { kind: 'clear', room: 'kitchen', mode: 'find' } },
  { id: 'sugarmouse', name: 'Sugar mouse', shelf: 0, art: 'sugarMouse', tint: '#ffc2d8', blurb: 'Mrs Pudding makes one every year and eats none.', earn: { kind: 'clear', room: 'kitchen', mode: 'diff' } },
  { id: 'teapot', name: 'Blue teapot', shelf: 0, art: 'teapot', tint: '#6aa8e0', blurb: 'Pours exactly two and a half cups. Always.', earn: { kind: 'clear', room: 'kitchen', mode: 'hunt' } },

  // shelf 1 — attic and greenhouse
  { id: 'robot', name: 'Wind-up robot', shelf: 1, art: 'robot', tint: '#9fb4c8', blurb: 'Walks three steps, bows, falls over.', earn: { kind: 'clear', room: 'attic', mode: 'find' } },
  { id: 'horse', name: 'Carousel horse', shelf: 1, art: 'horse', tint: '#ffd9a8', blurb: 'From a fair that packed up in 1904.', earn: { kind: 'clear', room: 'attic', mode: 'diff' } },
  { id: 'crown', name: 'Paper crown', shelf: 1, art: 'paperCrown', tint: '#ffd24f', blurb: 'Tatters wears it when he feels brave.', earn: { kind: 'clear', room: 'attic', mode: 'hunt' } },
  { id: 'belljar', name: 'Glass bell jar', shelf: 1, art: 'bellJar', tint: '#bfe8de', blurb: 'One dandelion seed, caught mid-float.', earn: { kind: 'clear', room: 'greenhouse', mode: 'find' } },
  { id: 'seeds', name: 'Moonflower seeds', shelf: 1, art: 'seedPacket', tint: '#9fd98a', blurb: 'Bloom only when somebody is watching.', earn: { kind: 'clear', room: 'greenhouse', mode: 'diff' } },
  { id: 'trowel', name: 'Lucky trowel', shelf: 1, art: 'trowel', tint: '#c9ccd6', blurb: 'Moss says it finds water. Moss says a lot of things.', earn: { kind: 'clear', room: 'greenhouse', mode: 'hunt' } },

  // shelf 2 — ballroom and cellar
  { id: 'silverbell', name: 'Silver bell', shelf: 2, art: 'silverBell', tint: '#dde4ef', blurb: 'Rings a note that makes everyone want to dance.', earn: { kind: 'clear', room: 'ballroom', mode: 'find' } },
  { id: 'dancecard', name: 'Dance card', shelf: 2, art: 'danceCard', tint: '#ffd4e6', blurb: 'Every line filled in with the same name: Twirl.', earn: { kind: 'clear', room: 'ballroom', mode: 'diff' } },
  { id: 'mask', name: 'Velvet mask', shelf: 2, art: 'mask', tint: '#b07ae0', blurb: 'For the night the whole manor pretended to be mice.', earn: { kind: 'clear', room: 'ballroom', mode: 'hunt' } },
  { id: 'lanternstub', name: 'Cellar lantern', shelf: 2, art: 'lantern', tint: '#ffcf7a', blurb: 'Glows a little brighter when you are lost.', earn: { kind: 'clear', room: 'cellar', mode: 'find' } },
  { id: 'jamribbon', name: 'Jam rosette', shelf: 2, art: 'rosette', tint: '#e8697f', blurb: 'First prize, village fair, year unknown.', earn: { kind: 'clear', room: 'cellar', mode: 'diff' } },
  { id: 'corkcrown', name: 'Cork crown', shelf: 2, art: 'corkCrown', tint: '#d8a86a', blurb: 'Jam made it out of spare corks. It squeaks.', earn: { kind: 'clear', room: 'cellar', mode: 'hunt' } },

  // shelf 3 — observatory and secrets
  { id: 'starcompass', name: 'Star compass', shelf: 3, art: 'starCompass', tint: '#9fc0ff', blurb: 'Points at whichever star you are thinking of.', earn: { kind: 'clear', room: 'observatory', mode: 'find' } },
  { id: 'moondial', name: 'Moon dial', shelf: 3, art: 'moonDial', tint: '#cfd8f5', blurb: 'Tells the time in moons. Nocta prefers it.', earn: { kind: 'clear', room: 'observatory', mode: 'diff' } },
  { id: 'cometmarble', name: 'Comet marble', shelf: 3, art: 'cometMarble', tint: '#8fe8ff', blurb: 'There is a tiny tail of light inside.', earn: { kind: 'clear', room: 'observatory', mode: 'hunt' } },
  { id: 'mousewhistle', name: 'Mouse whistle', shelf: 3, art: 'mouseWhistle', tint: '#cfd6de', blurb: 'Only mice can hear it. They mostly ignore it.', earn: { kind: 'mouse', n: 1 } },
  { id: 'cheesemedal', name: 'Cheese medal', shelf: 3, art: 'cheeseMedal', tint: '#f2cf6a', blurb: 'Awarded for three sightings of the manor mouse.', earn: { kind: 'mouse', n: 3 } },
  { id: 'mouseportrait', name: 'Mouse portrait', shelf: 3, art: 'mousePortrait', tint: '#b9a8d0', blurb: 'Oil on tin. He sat very still for it.', earn: { kind: 'mouse', n: 6 } },
];

export const CURIO = Object.fromEntries(CURIOS.map((c) => [c.id, c]));
export const SHELVES = ['Library & Kitchen', 'Attic & Greenhouse', 'Ballroom & Cellar', 'Stars & Secrets'];

// Which curio a cleared room mode hands over, if any.
export function curioFor(room, mode) {
  return CURIOS.find((c) => c.earn.kind === 'clear' && c.earn.room === room && c.earn.mode === mode) || null;
}

// Secret curios unlocked by mouse sightings.
export function mouseCurios(count) {
  return CURIOS.filter((c) => c.earn.kind === 'mouse' && count >= c.earn.n);
}
