// Curated, kid-safe word lists, levelled from single letters to punctuated
// sentences. Every entry is checked against the blocklist by the tests.
// Tiers 0-3 are lower-case ASCII; tier 4 adds capitals and punctuation.

const list = (text) => text.split(/\s+/).filter(Boolean);

export const TIER_NAMES = ['Letters', 'Short words', 'Longer words', 'Long words', 'Sentences'];

// Tier 0: single letters. Stages pick a subset by key group (see stages.js).
export const LETTERS = list('a b c d e f g h i j k l m n o p q r s t u v w x y z');

// Tier 1: 2-4 letters.
export const SHORT = list(`
  at in on up go hi me we so no be do my it us am an as by if of to ox oh
  cat dog sun hat cup map pig hen bee bug owl fox cow egg jam pie red big
  fun hop run sit zip yes hug mud pop box bed toy sky sea ant bus car fan
  gum ink jet kid kit log mop net nut pan pen rug tag tub van wig yak zoo
  art arm ear eye leg lip toe top web wet win wow yum ice oak elf ham dot
  bow fig jog hum key mix nap paw ray row sip tap wag
  frog duck cake kite ball bell boat book cape coat corn crab drum fish
  flag gift goat harp hill home horn jump king lamp leaf lion milk moon
  nest park pear pink play rain ring road rock rose sand seed ship shoe
  sing snow sock soup star swim tail tent toad tree tuba wand wave wind
  wing wish yarn yawn zoom puff hero kind glad gold blue dash dive easy
  fair farm game help hope idea joke lake mint nice oven pals pony quiz
  rope safe silk slow soft tidy wise bake bark bean bird blow bunk
`);

// Tier 2: 5-6 letters.
export const MEDIUM = list(`
  apple bread brave bunny candy castle cloud crown daisy dance dragon
  dream eagle fairy feast ginger grape happy honey horse juice jelly
  knight lemon magic melon mouse music noodle ocean otter panda party
  peach piano pirate pizza plant puppy queen quest rabbit river robot
  rocket royal shield silly smile snack snail spoon sprout story sugar
  sunny sword table teapot tiger toast tower train tulip turtle wagon
  water whale wizard yellow zebra banana basket bubble butter button
  carrot cheese cookie garden goose helmet kitten ladder lizard muffin
  orange parrot pickle pillow pocket puddle purple sleepy summer sunset
  tickle waffle window winter wobble cherry clover acorn badger beetle
  bonnet branch bridge cactus camel cradle cuddle donkey flower
  forest fridge gentle giggle goblet hiccup jacket jungle kettle koala
  llama marble mitten monkey nibble paddle pebble pepper planet pretty
  puzzle quiet riddle saddle sleigh sneeze spring squash stripe thumb
  tomato tunnel velvet violin wiggle yogurt zipper
`);

// Tier 3: 7-12 letters.
export const LONG = list(`
  adventure alphabet armadillo backpack balloon blanket blueberry
  butterfly campfire caterpillar champion chocolate cupcake dinosaur
  dragonfly elephant explorer fireworks flamingo giraffe grasshopper
  hedgehog honeybee kangaroo keyboard ladybug lantern lemonade
  marshmallow mushroom notebook octopus pancake penguin pineapple
  popcorn porcupine pumpkin rainbow sandwich scarecrow seashell
  snowflake spaghetti starfish strawberry sunflower telescope treasure
  trumpet umbrella unicorn volcano watermelon whistle wonderful
  xylophone yesterday sparkle gigantic friendship imagination invention
  jellybean kindness lighthouse moonlight nightingale orchestra
  playground raspberry saxophone skateboard snowman spaceship squirrel
  tortoise triangle waterfall windmill woodpecker birthday bookshelf
  breakfast carousel chipmunk cinnamon daydream doughnut envelope
  firefly goldfish hammock harmonica horseshoe iceberg jamboree
  lollipop mermaid necklace ostrich pajamas pinwheel reindeer sailboat
  sunshine tadpole tambourine toothbrush tricycle wheelbarrow
  acrobat blossom bluebird cardigan cheerful crayons cucumber dandelion
  dumpling gardener happiness horizon jellyfish ladybird meadowlark
  mountain musician necktie nutshell overalls paintbrush parsnip
  peppermint pinecone quicksand rhubarb rosebush scooter sprinkles
  stargazer storybook teaspoon thimble trampoline feathers
  wanderer wildflower
`);

// Tier 4: capitals, apostrophes and punctuation, single words or short
// phrases a monster can carry.
export const PUNCTUATED = [
  'Hello!', 'Hooray!', 'Yes!', 'Oh no!', 'Well,', "don't", "can't", "it's",
  "Let's go!", 'Ready?', 'Okay.', 'Wow!', 'Whoops!', 'Bravo!', 'Hmm...',
  'Honk!', 'Ahoy!', 'Huzzah!', 'Thanks!', 'Sorry!', 'Please?', 'Good job!',
  'Nice one!', 'Ta-da!', "We're", "You're", "I'm", 'Who?', 'Why?', 'How?',
  'Where?', 'Yikes!', 'Phew!', 'Achoo!', 'Bless you!', 'High five!',
  'Cheese!', 'Up we go!', 'Snack time!', 'Yum, yum.', 'Oh, hi!', 'Me too!',
  'Not yet.', 'Look out!', 'Maybe?', 'Sure thing.', "That's it!", "Who's there?",
  "I'll try.", "She's fast!", "He's silly.", "They're here!", 'Hold on.',
  'Quick, hide!', 'Goodnight.', 'Good morning!', 'Splendid!', 'Marvelous!',
  'Indeed.', 'Tea, please.', 'Hip, hip!', 'Encore!', 'Excuse me.', 'Pardon?',
  'Wait for me!', 'Over here!', 'Peekaboo!', 'Zoom, zoom!', 'Tick, tock.',
  'Knock, knock.', "Isn't it?", "Wasn't me!", "Couldn't be!", 'Ding dong!',
  'Hush now.', 'Shh!', 'Brr, cold!', 'Ouch, a pebble!', 'Abracadabra!',
  'Mmm, pie.', "Don't panic!", "It's a goose!", 'Hey, wait!', 'Cheerio!',
];

// Boss passages, split into phrases. One list per region (tier).
export const BOSS_PASSAGES = [
  // King Slime: letter groups for little hands.
  [
    ['fj', 'dk', 'sl', 'fjfj', 'asdf', 'jkl'],
    ['ff', 'jj', 'dd', 'kk', 'fdsa', 'jkl'],
    ['gh', 'fg', 'hj', 'asdfg', 'hjkl', 'fj'],
  ],
  // Mayor Morel: short words with spaces.
  [
    ['a big hug', 'for my pal', 'in the sun', 'is so fun'],
    ['the cat sat', 'on a red mat', 'and had a nap'],
    ['hop up', 'to the top', 'of the hill', 'and wave hi'],
  ],
  // Captain Honk: medium words.
  [
    ['the goose wore', 'a shiny helmet', 'and honked hello', 'to every duck'],
    ['captain honk', 'sailed a teapot', 'across the puddle', 'with a cookie'],
    ['seven silly geese', 'played the piano', 'in the garden', 'after supper'],
  ],
  // Baron Fluff: long words.
  [
    ['the fluffy baron', 'floated over', 'the sleepy castle', 'eating marshmallows'],
    ['a friendly cloud', 'rained lemonade', 'on the playground', 'every thursday'],
    ['the lighthouse keeper', 'counted snowflakes', 'and butterflies', 'until breakfast'],
  ],
  // Grumble the sleepy dragon: sentences with capitals and punctuation.
  [
    ['Once upon a time,', 'a dragon yawned.', 'Is it story time?', 'Yes, please!'],
    ['Grumble likes tea,', 'warm socks,', 'and very long naps.', 'Shh, goodnight!'],
    ["Don't wake him!", 'He snores like', 'a happy kettle.', 'Toot, toot!'],
  ],
];

export const TIER_WORDS = [LETTERS, SHORT, MEDIUM, LONG, PUNCTUATED];

// Every word the game can show outside of generated drills.
export function allEntries() {
  const out = [];
  TIER_WORDS.forEach((words, tier) => { for (const w of words) out.push({ tier, text: w }); });
  BOSS_PASSAGES.forEach((passages, tier) => {
    for (const p of passages) for (const phrase of p) out.push({ tier, text: phrase, boss: true });
  });
  return out;
}
