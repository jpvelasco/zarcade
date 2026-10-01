// Whiskerton's cast, places, things and mysteries. Plain data, DOM-free.
// Names avoid pronouns so every generated sentence reads cleanly.

export const CRITTERS = [
  { id: 'bunny', name: 'Bramble', species: 'rabbit', fur: '#f3e6d8', belly: '#fffaf3', accent: '#ff9fb2', trace: 'fur', fact: 'Bramble can hop over a whole carrot patch.', hello: 'Hi, Pip! Want a carrot?' },
  { id: 'duck', name: 'Dot', species: 'duck', fur: '#ffd84d', belly: '#fff2a8', accent: '#ff9b2f', trace: 'webprint', fact: 'Dot paddles laps around the pond every morning.', hello: 'Quack! Hello, detective!' },
  { id: 'goose', name: 'Granny Gus', species: 'goose', fur: '#f7f7f2', belly: '#ffffff', accent: '#ffa63d', trace: 'feather', fact: 'Granny Gus has won the pie prize nine times.', hello: 'Oh, hello, dear Pip.' },
  { id: 'owl', name: 'Olive', species: 'owl', fur: '#b78a5c', belly: '#ecd3a8', accent: '#ffcf3f', trace: 'feather', fact: 'Olive reads a book every single night.', hello: 'Hoo! Good day, Pip.' },
  { id: 'mouse', name: 'Milo', species: 'mouse', fur: '#b9b3c4', belly: '#efe9f5', accent: '#ffadc6', trace: 'pawprint', fact: 'Milo knows every cheese by its smell.', hello: 'Squeak! Hi there!' },
  { id: 'fox', name: 'Fern', species: 'fox', fur: '#f08a3c', belly: '#fff3e6', accent: '#3b2a24', trace: 'fur', fact: 'Fern paints sunsets on the windmill wall.', hello: 'Well hello, Pip!' },
  { id: 'bear', name: 'Bruno', species: 'bear', fur: '#9a6a45', belly: '#d9b38c', accent: '#5b3a24', trace: 'pawprint', fact: 'Bruno gives the best hugs in town.', hello: 'Hey, little buddy!' },
  { id: 'pig', name: 'Penny', species: 'pig', fur: '#ffb8c6', belly: '#ffd8e0', accent: '#e9788f', trace: 'hoofprint', fact: 'Penny bakes muffins as big as her head.', hello: 'Oink! Hiya, Pip!' },
  { id: 'frog', name: 'Finn', species: 'frog', fur: '#7fd36b', belly: '#d8f5a8', accent: '#3f9a3a', trace: 'webprint', fact: 'Finn can sing two songs at once. Ribbit!', hello: 'Ribbit! Hi, Pip!' },
  { id: 'hedgehog', name: 'Hazel', species: 'hedgehog', fur: '#8a6a50', belly: '#f2d9bd', accent: '#5a4334', trace: 'quill', fact: 'Hazel rolls into a ball when she giggles.', hello: 'Oh! Hello, Pip!' },
  { id: 'raccoon', name: 'Rocky', species: 'raccoon', fur: '#9a9aa6', belly: '#dcdce4', accent: '#3c3c48', trace: 'pawprint', fact: 'Rocky fixes anything with string and glue.', hello: 'Heya, Pip! What’s up?' },
  { id: 'sheep', name: 'Shelly', species: 'sheep', fur: '#ffffff', belly: '#f4f0ea', accent: '#4a3c3c', trace: 'wool', fact: 'Shelly knits scarves for the whole town.', hello: 'Baa! Hello, Pip!' },
  { id: 'goat', name: 'Gigi', species: 'goat', fur: '#e8dccb', belly: '#fff8ee', accent: '#9a7a5a', trace: 'hoofprint', fact: 'Gigi can climb to the top of the windmill.', hello: 'Meh-heh! Hi, Pip!' },
  { id: 'squirrel', name: 'Sunny', species: 'squirrel', fur: '#c96a32', belly: '#f6d3a8', accent: '#7a3a18', trace: 'fur', fact: 'Sunny hides acorns and forgets where.', hello: 'Hi hi hi, Pip!' },
  { id: 'turtle', name: 'Tilly', species: 'turtle', fur: '#8ccf7a', belly: '#e8e2a0', accent: '#5a8a3a', trace: 'shellprint', fact: 'Tilly is 99 years old and still loves tag.', hello: 'Hello… there… Pip.' },
  { id: 'badger', name: 'Benny', species: 'badger', fur: '#7a7a82', belly: '#f2f2f2', accent: '#26262c', trace: 'pawprint', fact: 'Benny digs the best tunnels in the hill.', hello: 'Evening! Er, morning!' },
  { id: 'cat', name: 'Coco', species: 'cat', fur: '#5a4a5e', belly: '#cfc0d6', accent: '#ffd23f', trace: 'pawprint', fact: 'Coco naps in nine sunny spots a day.', hello: 'Mrrow. Hello, Pip.' },
  { id: 'mole', name: 'Mo', species: 'mole', fur: '#5e5068', belly: '#e9b9c8', accent: '#ff8fae', trace: 'dirt', fact: 'Mo can tell the time by the taste of soil.', hello: 'Who’s there? Oh, Pip!' },
];

export const TRACES = {
  fur: 'a tuft of fur',
  webprint: 'webbed footprints',
  feather: 'a feather',
  pawprint: 'paw prints',
  hoofprint: 'little hoof prints',
  quill: 'a prickly quill',
  wool: 'a puff of wool',
  shellprint: 'slow, wide tracks',
  dirt: 'a pile of fresh dirt',
};

export const PLACES = [
  { id: 'bakery', name: 'Bakery', sky: 'day' },
  { id: 'pond', name: 'Duck Pond', sky: 'day' },
  { id: 'windmill', name: 'Windmill', sky: 'day' },
  { id: 'bandstand', name: 'Bandstand', sky: 'gold' },
  { id: 'library', name: 'Library', sky: 'day' },
  { id: 'garden', name: 'Flower Garden', sky: 'day' },
  { id: 'market', name: 'Market', sky: 'gold' },
  { id: 'townhall', name: 'Town Hall', sky: 'day' },
  { id: 'school', name: 'School', sky: 'day' },
  { id: 'orchard', name: 'Orchard', sky: 'gold' },
  { id: 'station', name: 'Train Station', sky: 'gold' },
  { id: 'icecream', name: 'Ice Cream Shop', sky: 'day' },
];

export const THINGS = [
  { id: 'kite', name: 'kite' },
  { id: 'umbrella', name: 'umbrella' },
  { id: 'basket', name: 'basket' },
  { id: 'ladder', name: 'ladder' },
  { id: 'book', name: 'book' },
  { id: 'trumpet', name: 'trumpet' },
  { id: 'balloon', name: 'balloon' },
  { id: 'can', name: 'watering can' },
  { id: 'bucket', name: 'bucket' },
  { id: 'net', name: 'net' },
  { id: 'lantern', name: 'lantern' },
  { id: 'teapot', name: 'teapot' },
];

// A mystery template: the missing thing, how to say who did it, and the
// silly reasons a culprit might give.
export const MYSTERIES = [
  {
    id: 'pie', item: 'pie', title: 'The Prize Pie',
    intro: 'Granny Gus baked a prize pie. Now it is gone!',
    ask: 'Who ate the pie?', doer: 'The pie-eater', did: 'ate the pie', crumbs: 'Pie crumbs',
    reasons: ['It smelled like sunshine!', 'I only wanted one bite. Then one more…', 'I thought it was a pie for everyone!', 'My tummy did the talking!'],
  },
  {
    id: 'hat', item: 'hat', title: 'The Mayor’s Hat',
    intro: 'Mayor Moose’s tall hat is missing!',
    ask: 'Who borrowed the hat?', doer: 'The hat-borrower', did: 'borrowed the hat', crumbs: 'A tall hat feather',
    reasons: ['I wanted to feel fancy!', 'It was perfect for a bird nest!', 'I was practicing my mayor voice!', 'It kept the rain off my ears!'],
  },
  {
    id: 'kitten', item: 'kitten', title: 'Where Is Mittens?',
    intro: 'Mittens the kitten wandered off!',
    ask: 'Who did Mittens follow?', doer: 'Mittens’ new pal', did: 'had Mittens tag along', crumbs: 'Tiny kitten paw prints',
    reasons: ['Mittens followed me! We played tag!', 'Mittens liked my fluffy tail!', 'We were having a nap party!', 'Mittens wanted to see the ducks!'],
  },
  {
    id: 'cookies', item: 'cookies', title: 'The Cookie Jar',
    intro: 'The cookie jar is empty! Every cookie is gone!',
    ask: 'Who took the cookies?', doer: 'The cookie-taker', did: 'took the cookies', crumbs: 'Cookie crumbs',
    reasons: ['I was building a cookie tower!', 'I wanted to feed the birds!', 'They were calling my name!', 'I was counting them. With my mouth.'],
  },
  {
    id: 'bell', item: 'bell', title: 'The Silent Bell',
    intro: 'The school bell is gone! Nobody knows when lunch is!',
    ask: 'Who took the bell?', doer: 'The bell-taker', did: 'took the bell', crumbs: 'A tiny ring of bell dust',
    reasons: ['I wanted to start a band!', 'It was too loud! I gave it a nap.', 'I wanted lunch to come sooner!', 'It was so shiny!'],
  },
  {
    id: 'trophy', item: 'trophy', title: 'The Sunflower Trophy',
    intro: 'The golden sunflower trophy has vanished!',
    ask: 'Who took the trophy?', doer: 'The trophy-taker', did: 'took the trophy', crumbs: 'Golden sparkles',
    reasons: ['I wanted to shine it extra shiny!', 'I used it as a flower pot!', 'I wanted to hold it just once!', 'It looked lonely on the shelf!'],
  },
  {
    id: 'cake', item: 'cake', title: 'The Birthday Cake',
    intro: 'Tilly’s birthday cake is missing! The party is soon!',
    ask: 'Who took the cake?', doer: 'The cake-taker', did: 'took the cake', crumbs: 'Pink frosting drips',
    reasons: ['I was adding more sprinkles!', 'I wanted to hide it for a surprise!', 'I licked one corner. Oops.', 'I thought it was a hat!'],
  },
  {
    id: 'acorn', item: 'acorn', title: 'The Golden Acorn',
    intro: 'The town’s golden acorn is not in its box!',
    ask: 'Who took the acorn?', doer: 'The acorn-taker', did: 'took the acorn', crumbs: 'Gold acorn shavings',
    reasons: ['I wanted to plant a golden tree!', 'Sunny said it was hers! Wait…', 'It was a perfect juggling ball!', 'I thought it was a snack!'],
  },
  {
    id: 'scarf', item: 'scarf', title: 'The Long Scarf',
    intro: 'Shelly knitted the longest scarf ever. It is gone!',
    ask: 'Who took the scarf?', doer: 'The scarf-taker', did: 'took the scarf', crumbs: 'Bits of red yarn',
    reasons: ['I was cold! Very, very cold!', 'I made a scarf swing!', 'I wanted to wrap a present!', 'I was playing jump rope!'],
  },
  {
    id: 'map', item: 'map', title: 'The Treasure Map',
    intro: 'The old treasure map fell out of the library book!',
    ask: 'Who took the map?', doer: 'The map-taker', did: 'took the map', crumbs: 'Torn paper bits',
    reasons: ['I wanted to find treasure for everyone!', 'I was using it as a napkin. Sorry!', 'I wanted to draw my own X!', 'It was a hat for my hat!'],
  },
];

export const PIP = { name: 'Pip', species: 'beagle' };

export const byId = (list, id) => list.find((x) => x.id === id);
