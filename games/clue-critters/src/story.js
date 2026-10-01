// The twelve story cases, in three chapters. Cast, places, things, the
// answer, the crime fact, every greeting and every confession are written by
// hand. The clue list comes from the generator with a fixed seed over that
// answer, and the tests prove each one has a single, reachable answer.
import { buildCase } from './cases.js';

export const CHAPTERS = [
  { id: 1, title: 'New Pup in Town', difficulty: 1 },
  { id: 2, title: 'Busy Week', difficulty: 2 },
  { id: 3, title: 'Chief of Whiskerton', difficulty: 3 },
];

// place[s] and thing[s] index the case's places and things lists.
export const STORY = [
  {
    id: 'pie', chapter: 1, mystery: 'pie', title: 'The Prize Pie',
    intro: 'Granny Gus baked a prize pie. Now it is gone! Only crumbs are left.',
    suspects: ['bunny', 'duck', 'bear'], places: ['bakery', 'pond', 'bandstand'], things: ['basket', 'umbrella', 'kite'],
    solution: { place: [0, 1, 2], thing: [0, 1, 2] }, crime: { kind: 'place', idx: 2 },
    flavor: ['Pie? I only eat carrots! Mostly.', 'Quack! I love pie. But I love bread more!', 'Hello, buddy. My tummy is very full. Hmm.'],
    reason: 'It smelled like honey and sunshine! I only meant to sniff it.',
  },
  {
    id: 'hat', chapter: 1, mystery: 'hat', title: 'The Mayor’s Hat',
    intro: 'Mayor Moose’s tall hat is gone! The town photo is today!',
    suspects: ['goat', 'owl', 'squirrel'], places: ['townhall', 'windmill', 'garden'], things: ['ladder', 'book', 'net'],
    solution: { place: [1, 0, 2], thing: [0, 1, 2] }, crime: { kind: 'thing', idx: 0 },
    flavor: ['I can climb anything! Want to see?', 'Hoo. I was reading. Shh.', 'Hats? I love hats! For acorns!'],
    reason: 'I wanted to see if I look like a mayor. I do!',
  },
  {
    id: 'mittens', chapter: 1, mystery: 'kitten', title: 'Where Is Mittens?',
    intro: 'Mittens the kitten wandered off! She followed someone.',
    suspects: ['cat', 'mouse', 'sheep'], places: ['library', 'school', 'market'], things: ['lantern', 'basket', 'balloon'],
    solution: { place: [0, 1, 2], thing: [2, 0, 1] }, crime: { kind: 'place', idx: 2 },
    flavor: ['Mittens is my little cousin. Please find her!', 'K-kitten? Eek! Kittens are big to me!', 'Baa! I’ve been knitting all day.'],
    reason: 'Mittens loves my wool! She napped in my basket all morning.',
  },
  {
    id: 'cookies', chapter: 1, mystery: 'cookies', title: 'The Cookie Jar',
    intro: 'Penny’s cookie jar is empty! Every cookie is gone.',
    suspects: ['pig', 'raccoon', 'frog'], places: ['bakery', 'station', 'icecream'], things: ['bucket', 'trumpet', 'teapot'],
    solution: { place: [0, 2, 1], thing: [2, 0, 1] }, crime: { kind: 'thing', idx: 0 },
    flavor: ['My cookies! I baked them with love!', 'Cookies? Never heard of ’em. What are cookies?', 'Ribbit! I like flies. Not cookies.'],
    reason: 'I was building a cookie tower! Then I ate the tower.',
  },
  {
    id: 'bell', chapter: 2, mystery: 'bell', title: 'The Silent Bell',
    intro: 'The school bell is gone! Nobody knows when lunch is!',
    suspects: ['hedgehog', 'fox', 'duck', 'badger'], places: ['school', 'bandstand', 'orchard', 'pond'], things: ['trumpet', 'kite', 'net', 'lantern'],
    solution: { place: [0, 1, 3, 2], thing: [2, 0, 1, 3] }, crime: { kind: 'place', idx: 1 },
    flavor: ['Oh dear! Lunch is my favorite class.', 'A bell? How fancy. Not mine!', 'Quack! I can’t tell time without it!', 'I was digging. I hear nothing down there.'],
    reason: 'I wanted to start a band! Ding, ding, toot!',
  },
  {
    id: 'trophy', chapter: 2, mystery: 'trophy', title: 'The Sunflower Trophy',
    intro: 'The golden sunflower trophy has vanished from Town Hall!',
    suspects: ['bunny', 'goose', 'mole', 'turtle'], places: ['garden', 'townhall', 'library', 'windmill'], things: ['can', 'book', 'umbrella', 'ladder'],
    solution: { place: [3, 1, 0, 2], thing: [3, 1, 0, 2] }, crime: { kind: 'place', idx: 0 },
    flavor: ['I grew the biggest carrot! Not a sunflower.', 'I have nine pie prizes, dear. I don’t need it.', 'I can’t see shiny things. Too shiny!', 'I… was… right… here.'],
    reason: 'I thought it was a golden flower! I tried to plant it.',
  },
  {
    id: 'cake', chapter: 2, mystery: 'cake', title: 'The Birthday Cake',
    intro: 'Tilly turns 100 today! But her birthday cake is missing!',
    suspects: ['bear', 'pig', 'squirrel', 'owl'], places: ['bakery', 'icecream', 'orchard', 'station'], things: ['balloon', 'teapot', 'basket', 'lantern'],
    solution: { place: [1, 0, 2, 3], thing: [2, 1, 0, 3] }, crime: { kind: 'thing', idx: 0 },
    flavor: ['Cake? I just had ice cream. Honest!', 'I made that cake! Who would take it?', 'Party! Party! Is it party time?', 'Hoo. Tilly is my oldest friend.'],
    reason: 'I was hiding it for a surprise! SURPRISE!',
  },
  {
    id: 'scarf', chapter: 2, mystery: 'scarf', title: 'The Long Scarf',
    intro: 'Shelly knitted the longest scarf ever. It is gone!',
    suspects: ['cat', 'goat', 'frog', 'mouse'], places: ['market', 'pond', 'school', 'windmill'], things: ['kite', 'bucket', 'net', 'umbrella'],
    solution: { place: [0, 3, 1, 2], thing: [3, 0, 2, 1] }, crime: { kind: 'place', idx: 1 },
    flavor: ['Yarn? Mrrow. I would never play with yarn.', 'I eat socks, not scarves!', 'Ribbit! It’s warm by the pond.', 'A scarf that long? I could get lost in it!'],
    reason: 'I made a scarf swing over the pond! Wheee!',
  },
  {
    id: 'map', chapter: 3, mystery: 'map', title: 'The Treasure Map',
    intro: 'An old treasure map fell out of a library book. Now it’s gone!',
    suspects: ['raccoon', 'owl', 'badger', 'hedgehog', 'sheep'], places: ['library', 'orchard', 'windmill', 'station', 'garden'], things: ['lantern', 'book', 'ladder', 'net', 'basket'],
    solution: { place: [2, 0, 1, 4, 3], thing: [2, 1, 0, 3, 4] }, crime: { kind: 'place', idx: 1 },
    flavor: ['Treasure? I like shiny junk. Not maps.', 'Hoo! That map was in MY library!', 'I don’t need maps. I dig where I like.', 'Oh my. Is it a real treasure?', 'Baa! I can’t read maps anyway.'],
    reason: 'I wanted to dig up treasure for everyone! I found… a potato.',
  },
  {
    id: 'acorn', chapter: 3, mystery: 'acorn', title: 'The Golden Acorn',
    intro: 'The golden acorn is not in its box! The fair starts soon.',
    suspects: ['squirrel', 'mole', 'duck', 'fox', 'turtle'], places: ['townhall', 'garden', 'pond', 'orchard', 'bandstand'], things: ['bucket', 'can', 'kite', 'trumpet', 'umbrella'],
    solution: { place: [3, 1, 2, 4, 0], thing: [0, 1, 2, 3, 4] }, crime: { kind: 'thing', idx: 4 },
    flavor: ['It’s not me! I only hide normal acorns!', 'Golden? I can’t even see gold.', 'Quack! Acorns sink. I tried.', 'I paint gold things. I don’t take them!', 'Hello… Pip… slow… day.'],
    reason: 'I hid it under my shell to keep it safe. Then I forgot. I am 100!',
  },
  {
    id: 'pie2', chapter: 3, mystery: 'pie', title: 'The Midnight Pie',
    intro: 'Granny Gus baked a new prize pie. It vanished overnight!',
    suspects: ['goose', 'bear', 'pig', 'mouse', 'cat'], places: ['bakery', 'market', 'station', 'icecream', 'school'], things: ['teapot', 'basket', 'balloon', 'book', 'lantern'],
    solution: { place: [0, 3, 1, 4, 2], thing: [4, 3, 1, 0, 2] }, crime: { kind: 'place', idx: 0 },
    flavor: ['Not again! My poor pie!', 'Bruno is a changed bear! I only sniff now.', 'I baked muffins, not pies!', 'Squeak! Pie is bigger than me!', 'Mrrow. I was asleep. Nine times.'],
    reason: 'I ate my own pie! I had to check it was tasty. It was.',
  },
  {
    id: 'party', chapter: 3, mystery: 'hat', title: 'The Big Parade',
    intro: 'The parade starts soon, and the Mayor’s hat is gone AGAIN!',
    suspects: ['bunny', 'frog', 'goat', 'owl', 'raccoon'], places: ['townhall', 'windmill', 'library', 'bandstand', 'pond'], things: ['ladder', 'trumpet', 'kite', 'balloon', 'net'],
    solution: { place: [3, 4, 1, 2, 0], thing: [1, 4, 0, 3, 2] }, crime: { kind: 'thing', idx: 3 },
    flavor: ['Not me! I’m playing in the parade!', 'Ribbit! I’m the parade drummer!', 'I gave the last hat back! Really!', 'Hoo. A hat makes a lovely… never mind.', 'I could fix that hat. If I had it.'],
    reason: 'I made a cozy nest in it. Look! Three eggs!',
  },
];

// Seeds were picked once so every story grid reads nicely; tests guard them.
const SEEDS = [101, 202, 303, 404, 505, 606, 707, 808, 909, 1010, 1111, 1212];

export const STORY_CASES = STORY.map((def, i) => buildCase({
  ...def,
  kind: 'story',
  difficulty: CHAPTERS[def.chapter - 1].difficulty,
  seed: SEEDS[i],
  home: def.crime.kind === 'place' ? def.crime.idx : 0,
}));

export function storyCase(i) {
  return STORY_CASES[i];
}
