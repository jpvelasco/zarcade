// The whole content of Potion Pals: ingredients, recipes, potions and pals.
// DOM-free so Node tests can prove the graph is sound.
//
// The table is authored in layers: a row may only name ingredients that appear
// above it. Reachability from the eight starting ingredients is therefore
// structural, and tests/recipes.test.js proves it by search.
//
// Columns: id | name | blurb | tags | shape | colour | colour 2 | from | pal
//   from  '' for a starting ingredient, otherwise the inputs (2 or 3, space
//         separated, repeats allowed: 'ember ember').
//   pal   '' for an ingredient, '-' for a keepsake potion, otherwise the id of
//         the pal the potion summons.

const RAW = [
  // ---------------------------------------------------------------- starters
  ['moonberry', 'Moonberry', 'A little berry that hums a lullaby after dark.', 'sweet cold glowy', 'berry', '#7a4fd0', '#cfa8ff', '', ''],
  ['frogsneeze', 'Frog Sneeze', 'Caught in a jar on a rainy Tuesday. Still damp.', 'silly slimy green', 'blob', '#5fbf4a', '#b4e87a', '', ''],
  ['starlight', 'Starlight', 'Scooped off the window with a long spoon.', 'glowy sparkly warm', 'stars', '#ffe06a', '#fff6c0', '', ''],
  ['honey', 'Honey', 'From the bees who live in the chimney.', 'sweet sticky warm', 'drop', '#f3a81e', '#ffd978', '', ''],
  ['snow', 'Snow', 'Never melts in this jar. Nobody knows why.', 'cold soft white', 'flake', '#9fd8ff', '#ffffff', '', ''],
  ['ember', 'Ember', 'One hot orange wink from last night’s fire.', 'warm loud bright', 'flame', '#ff6a2a', '#ffc95a', '', ''],
  ['mushroom', 'Mushroom', 'Picked from the bottom step. Politely.', 'earthy soft spotty', 'mushroom', '#d66a7a', '#ffeedd', '', ''],
  ['dewdrop', 'Dewdrop', 'This morning, off the tallest leaf.', 'cool clean shiny', 'drop', '#6fd0e8', '#cdf4ff', '', ''],

  // ------------------------------------------------- every pair of starters
  ['moonjelly', 'Moon Jelly', 'Two moonberries got along far too well.', 'sweet wobbly purple', 'blob', '#8a52c8', '#d4a6f8', 'moonberry moonberry', ''],
  ['fizzberry', 'Fizzberry', 'It sneezes back when you shake it.', 'silly fizzy sweet', 'fizz', '#9a5ad0', '#8fe06a', 'moonberry frogsneeze', ''],
  ['glowgrape', 'Glowgrape', 'Bright enough to read one word at a time.', 'glowy sweet purple', 'berry', '#a060e8', '#ffe88a', 'moonberry starlight', ''],
  ['moonjam', 'Moonjam', 'Spread it on toast and the toast hums.', 'sweet sticky purple', 'jar', '#7a4aa8', '#e0a8ff', 'moonberry honey', ''],
  ['frostberry', 'Frostberry', 'Crunchy outside, cool and sweet inside.', 'cold sweet crunchy', 'berry', '#7f9ee8', '#dff0ff', 'moonberry snow', ''],
  ['berryblush', 'Berry Blush', 'Warm pink syrup. Smells like summer.', 'warm sweet pink', 'drop', '#f0608a', '#ffc0d4', 'moonberry ember', ''],
  ['berrycap', 'Berrycap', 'A mushroom that tastes mysteriously of jam.', 'earthy sweet spotty', 'mushroom', '#9a4a8a', '#ffd0e8', 'moonberry mushroom', ''],
  ['berryjuice', 'Berry Juice', 'Purple, cold, two straws.', 'sweet wet purple', 'bottle', '#8f4ad0', '#d8b0ff', 'moonberry dewdrop', ''],
  ['gigglegas', 'Giggle Gas', 'One sniff and your nose laughs for you.', 'silly loud green', 'cloud', '#8ad84a', '#dcf8a8', 'frogsneeze frogsneeze', ''],
  ['gleamslime', 'Gleamslime', 'Slime with its own nightlight.', 'glowy slimy green', 'blob', '#6ae0a0', '#e0ffc8', 'frogsneeze starlight', ''],
  ['stickyslime', 'Sticky Slime', 'Do not put this in your pocket.', 'sticky slimy green', 'blob', '#9ac84a', '#f0e08a', 'frogsneeze honey', ''],
  ['slimeslush', 'Slime Slush', 'Cold, green, surprisingly nice.', 'cold slimy silly', 'cup', '#7fd0a8', '#d8ffe8', 'frogsneeze snow', ''],
  ['popbubble', 'Pop Bubble', 'It pops, then apologises.', 'loud silly bouncy', 'ring', '#5fc8d8', '#ffe8a0', 'frogsneeze ember', ''],
  ['toadstool', 'Toadstool', 'Spotty. Possibly rude.', 'earthy silly spotty', 'mushroom', '#e05a4a', '#fff0e0', 'frogsneeze mushroom', ''],
  ['pondwater', 'Pond Water', 'Green, friendly, full of tiny news.', 'wet green earthy', 'bottle', '#4aa87a', '#a8e0b8', 'frogsneeze dewdrop', ''],
  ['starcluster', 'Star Cluster', 'Seven stars holding hands.', 'sparkly glowy bright', 'stars', '#ffd24a', '#fff8d0', 'starlight starlight', ''],
  ['starsyrup', 'Star Syrup', 'Pour it slowly; it drips upwards first.', 'sweet sparkly sticky', 'bottle', '#f0c040', '#fff0b0', 'starlight honey', ''],
  ['starfrost', 'Starfrost', 'A snowflake with the lights left on.', 'cold sparkly white', 'flake', '#bfd8ff', '#fffbe0', 'starlight snow', ''],
  ['sunspark', 'Sunspark', 'Hold it up and the room goes gold.', 'warm bright loud', 'spark', '#ffb020', '#fff0a0', 'starlight ember', ''],
  ['glowcap', 'Glowcap', 'The bedside lamp of the forest floor.', 'glowy earthy soft', 'mushroom', '#8ad0a0', '#f8ffc0', 'starlight mushroom', ''],
  ['mirrordrop', 'Mirror Drop', 'A drop that shows you upside down.', 'shiny clean cool', 'drop', '#b0d8e8', '#ffffff', 'starlight dewdrop', ''],
  ['honeycomb', 'Honeycomb', 'Still faintly buzzing with pride.', 'sweet sticky warm', 'comb', '#e8a820', '#ffe08a', 'honey honey', ''],
  ['honeyfrost', 'Honeyfrost', 'Sweet ice that never drips on you.', 'cold sweet soft', 'cup', '#f0d070', '#e8f8ff', 'honey snow', ''],
  ['caramel', 'Caramel', 'Pulled into a long shiny ribbon.', 'sweet warm sticky', 'swirl', '#c87a28', '#ffc870', 'honey ember', ''],
  ['honeycap', 'Honeycap', 'A mushroom the bees adopted.', 'sweet earthy soft', 'mushroom', '#d8a040', '#fff0c0', 'honey mushroom', ''],
  ['nectar', 'Nectar', 'The clean sweet middle of a flower.', 'sweet clean soft', 'drop', '#ffd060', '#fff8d8', 'honey dewdrop', ''],
  ['snowball', 'Snowball', 'Perfectly round. Never thrown indoors.', 'cold bouncy soft', 'orb', '#d8ecff', '#ffffff', 'snow snow', ''],
  ['steam', 'Steam', 'Warm breath from a cold jar.', 'warm wet soft', 'cloud', '#c8d8e0', '#ffffff', 'snow ember', ''],
  ['snowcap', 'Snowcap', 'Wears a tiny white hat all year.', 'cold earthy soft', 'mushroom', '#9ab0d0', '#f0f8ff', 'snow mushroom', ''],
  ['snowlace', 'Snow Lace', 'Frost drawn by a very patient artist.', 'cold pretty soft', 'flake', '#a8c8f0', '#ffffff', 'snow dewdrop', ''],
  ['bonfire', 'Bonfire', 'Two embers agreed to show off.', 'warm loud bright', 'flame', '#ff4a1a', '#ffd04a', 'ember ember', ''],
  ['roastcap', 'Roastcap', 'Toasted until the edges went crisp.', 'warm earthy crunchy', 'mushroom', '#a85a30', '#ffcf90', 'ember mushroom', ''],
  ['smoke', 'Smoke', 'It curls into shapes if you ask nicely.', 'warm soft grey', 'cloud', '#8a8296', '#d8d4e0', 'ember dewdrop', ''],
  ['fairyring', 'Fairy Ring', 'Step inside and the air goes quiet.', 'earthy magic glowy', 'ring', '#b06ad0', '#ffd8f0', 'mushroom mushroom', ''],
  ['moss', 'Moss', 'The softest green carpet in the world.', 'green soft earthy', 'leaf', '#4a9a4a', '#a8d87a', 'mushroom dewdrop', ''],
  ['puddle', 'Puddle', 'Small, shallow, excellent for splashing.', 'wet clean cool', 'puddle', '#5ab0d8', '#c0ecff', 'dewdrop dewdrop', ''],

  // --------------------------------------------------------------- branching
  ['cloud', 'Cloud', 'A whole cloud, folded small.', 'soft white sky', 'cloud', '#c0d8f0', '#ffffff', 'steam snow', ''],
  ['rainbow', 'Rainbow', 'Seven colours in a neat little arc.', 'bright pretty magic', 'arc', '#ff7a5a', '#6ad0ff', 'steam starlight', ''],
  ['stormfluff', 'Storm Fluff', 'Grumpy cloud. Rumbles if poked.', 'loud grey sky', 'cloud', '#6a6a86', '#aeb4cc', 'cloud ember', ''],
  ['cottoncandy', 'Cotton Candy', 'A cloud that decided to be pudding.', 'sweet soft pink', 'candy', '#ff8ab8', '#ffd8ec', 'cloud honey', ''],
  ['raincloud', 'Rain Cloud', 'Polite rain. Only falls on plants.', 'wet grey sky', 'cloud', '#7a90b0', '#c0d0e8', 'cloud smoke', ''],
  ['fern', 'Fern', 'Unrolls one curl every morning.', 'green soft pretty', 'fern', '#3f8f52', '#9ad08a', 'moss dewdrop', ''],
  ['glowmoss', 'Glowmoss', 'Moss that lights the way to bed.', 'glowy green soft', 'leaf', '#58c070', '#d8ffb0', 'moss starlight', ''],
  ['blossom', 'Blossom', 'Opens when it hears a kind word.', 'pretty sweet soft', 'flower', '#ff90b8', '#fff0f6', 'nectar moss', ''],
  ['ash', 'Ash', 'Soft grey dust with one warm thought left.', 'warm grey soft', 'lump', '#8a8490', '#cac6d2', 'bonfire snow', ''],
  ['beeswax', 'Beeswax', 'Golden, bendy, smells like a summer shed.', 'warm sticky gold', 'block', '#e0a830', '#ffe09a', 'honeycomb ember', ''],
  ['candle', 'Candle', 'Burns with a small steady heart.', 'warm bright soft', 'candle', '#ffd86a', '#fff4c8', 'beeswax bonfire', ''],
  ['shadow', 'Shadow', 'Somebody’s spare one, kept neatly rolled.', 'spooky soft dark', 'shard', '#473a5e', '#8a7aa8', 'smoke moonberry', ''],
  ['laughter', 'Bottled Laughter', 'Uncork near anyone who needs it.', 'silly loud sweet', 'bottle', '#ffb83a', '#fff0a8', 'gigglegas honey', ''],
  ['bubble', 'Bubble', 'Lasts an hour if nobody breathes.', 'shiny bouncy soft', 'ring', '#9ae0ff', '#ffffff', 'popbubble dewdrop', ''],
  ['tadpole', 'Tadpole', 'All head and hope.', 'wet wiggly green', 'tadpole', '#4a9a5a', '#b8e8a0', 'pondwater frogsneeze', ''],
  ['spores', 'Giggle Spores', 'They drift about telling small jokes.', 'silly earthy soft', 'dust', '#c0d86a', '#f8ffd0', 'toadstool gigglegas', ''],
  ['mirror', 'Mirror Shard', 'Shows the room one second ago.', 'shiny cold magic', 'shard', '#a8c0d0', '#ffffff', 'mirrordrop snowlace', ''],
  ['pixiedust', 'Pixie Dust', 'Makes heavy things forget to be heavy.', 'sparkly magic glowy', 'dust', '#ff9ae0', '#fff0ff', 'fairyring starlight', ''],
  ['toffee', 'Toffee', 'Chewy enough to keep you quiet for ages.', 'sweet chewy warm', 'block', '#b06a20', '#ffc878', 'caramel snow', ''],
  ['jellycube', 'Jelly Cube', 'Wobbles for a full minute after a nudge.', 'wobbly cold sweet', 'cube', '#9a60d8', '#e0b8ff', 'moonjelly snowball', ''],
  ['brook', 'Babbling Brook', 'A whole stream in a bottle, still chatting.', 'wet cold loud', 'wave', '#4ab0d0', '#bfecff', 'puddle snowball', ''],
  ['sunflower', 'Sunflower', 'Taller than you by Thursday.', 'warm bright pretty', 'flower', '#ffc02a', '#8a6a30', 'sunspark moss', ''],
  ['icicle', 'Icicle', 'A single clear note when flicked.', 'cold shiny spiky', 'spike', '#8fc8f0', '#ffffff', 'starfrost dewdrop', ''],
  ['slushie', 'Berry Slushie', 'Brain freeze, worth it.', 'cold sweet silly', 'cup', '#8a5ad8', '#dcc0ff', 'slimeslush berryjuice', ''],
  ['sorbet', 'Berry Sorbet', 'Served in a frost-painted bowl.', 'cold sweet pretty', 'cup', '#b06ad0', '#ffe0f4', 'frostberry snowlace', ''],
  ['glowworm', 'Glow Worm', 'Carries its own tiny lantern.', 'glowy wiggly soft', 'worm', '#9ae058', '#f8ffb0', 'gleamslime glowmoss', ''],
  ['chewybubble', 'Chewy Bubble', 'Blow one and it bounces off the ceiling.', 'bouncy sticky silly', 'ring', '#ff9ac0', '#fff0d8', 'stickyslime bubble', ''],
  ['rosepetal', 'Rose Petal', 'Velvet, and faintly warm.', 'pretty warm soft', 'petal', '#e8486a', '#ffc0cc', 'berryblush blossom', ''],
  ['stew', 'Mushroom Stew', 'Three mushrooms, one happy pot.', 'warm earthy sweet', 'cup', '#a86a3a', '#ffd8a0', 'berrycap honeycap ember', ''],
  ['puffcap', 'Puffcap', 'Puffs a small laugh when it is picked.', 'silly earthy soft', 'mushroom', '#c89a60', '#fff4d8', 'roastcap spores', ''],
  ['snowglobe', 'Snow Globe', 'Shake it and a tiny winter begins.', 'cold shiny pretty', 'globe', '#8ab8e0', '#ffffff', 'snowcap bubble', ''],
  ['mushlamp', 'Mushroom Lamp', 'Glows warmer the later it gets.', 'glowy warm earthy', 'lamp', '#d8c060', '#fff4c0', 'glowcap beeswax', ''],
  ['icecream', 'Ice Cream', 'Two scoops. Always two.', 'cold sweet soft', 'cone', '#ffe8c0', '#d8a060', 'honeyfrost cloud', ''],
  ['sundae', 'Star Sundae', 'The cherry is an actual small star.', 'sweet cold sparkly', 'cone', '#ffd86a', '#ff8ab0', 'starsyrup icecream', ''],
  ['nightjam', 'Night Jam', 'Spread thinly, or you will dream too much.', 'spooky sweet purple', 'jar', '#4a3270', '#a07ad8', 'moonjam shadow', ''],
  ['fairyfruit', 'Fairy Fruit', 'One bite makes your voice go sparkly.', 'glowy magic sweet', 'berry', '#ff8ad8', '#fff0b8', 'glowgrape pixiedust', ''],
  ['sodapop', 'Berry Soda', 'Fizzes right up your nose. Worth it.', 'fizzy sweet loud', 'bottle', '#a05ae0', '#ffd8f0', 'fizzberry bubble', ''],
  ['prism', 'Prism', 'Catches a sunbeam and shares it out.', 'shiny bright magic', 'prism', '#bfd8ff', '#ffb0e0', 'rainbow pixiedust', ''],
  ['lightning', 'Lightning Bolt', 'Kept in a jar with a rubber lid.', 'loud bright warm', 'bolt', '#ffe84a', '#fff8c8', 'stormfluff starlight', ''],
  ['clay', 'Clay', 'Squeezes into whatever you are thinking of.', 'earthy soft grey', 'lump', '#9a7a6a', '#d8c0b0', 'ash puddle', ''],
  ['teacup', 'Tiny Teacup', 'Holds exactly one small comfort.', 'warm earthy pretty', 'cup', '#e8d8c0', '#b07a5a', 'clay bonfire', ''],
  ['galaxy', 'Pocket Galaxy', 'A whole sky, spinning slowly in your palm.', 'glowy magic sparkly', 'galaxy', '#4a3a8a', '#ffd8f8', 'starcluster shadow', ''],

  // ----------------------------------------------------------------- potions
  ['mossbloombrew', 'Mossbloom Brew', 'Smells of rain on a green hill.', 'green soft magic', 'flask', '#4ab05a', '#c0f0a0', 'moss blossom dewdrop', 'mossy'],
  ['fizzyfriendfizz', 'Fizzy Friend Fizz', 'The cork comes out giggling.', 'fizzy silly loud', 'vial', '#3ec8d8', '#d0fbff', 'sodapop laughter', 'fizz'],
  ['cinderdraught', 'Cinder Draught', 'Warms your hands through the glass.', 'warm bright loud', 'flask', '#ff5a2a', '#ffcf80', 'bonfire candle', 'cinder'],
  ['cloudcordial', 'Cloudkitten Cordial', 'Pours like a nap.', 'soft white sky', 'roundflask', '#cfe0f8', '#ffffff', 'cloud cottoncandy', 'nimbus'],
  ['sprinklesyrup', 'Sprinkle Syrup', 'Half sugar, half starlight.', 'sweet sparkly pink', 'vial', '#ff7ab8', '#fff0c0', 'pixiedust sundae', 'sprinkle'],
  ['glimmertonic', 'Glimmer Tonic', 'Too bright to look at for long.', 'glowy bright sparkly', 'flask', '#ffd23a', '#fff8d0', 'starcluster prism', 'glimmer'],
  ['brambletea', 'Bramble Tea', 'Brewed for exactly four minutes.', 'earthy warm green', 'roundflask', '#7a5a3a', '#cfae7a', 'fern teacup', 'bramble'],
  ['puddingpotion', 'Pudding Potion', 'Wobbles in time with your footsteps.', 'wobbly sweet warm', 'vial', '#c08a40', '#ffd8a0', 'jellycube caramel', 'pudding'],
  ['snowpuffslush', 'Snowpuff Slush', 'Cold enough to make your nose pink.', 'cold soft white', 'flask', '#cfe8ff', '#ffffff', 'slushie icecream', 'snowpuff'],
  ['bloopbottle', 'Bloop Bottle', 'Something is definitely swimming in there.', 'wet green wiggly', 'roundflask', '#3fa868', '#c0f0c8', 'tadpole brook', 'bloop'],
  ['pipsqueakpotion', 'Pipsqueak Potion', 'Makes a very small squeak when opened.', 'earthy silly soft', 'vial', '#9a8a7a', '#e0d8c8', 'stew spores', 'pip'],
  ['zephyrzest', 'Zephyr Zest', 'A breeze with an opinion.', 'loud bright sky', 'flask', '#3fc0b0', '#d0fff4', 'rainbow stormfluff', 'zephyr'],
  ['lumenelixir', 'Lumen Elixir', 'Glows brighter when somebody smiles.', 'glowy magic soft', 'roundflask', '#a87ae8', '#f0d8ff', 'glowworm galaxy', 'lumen'],
  ['cocoacomfort', 'Cocoa Comfort', 'Three marshmallows, no arguments.', 'warm sweet soft', 'flask', '#7a4a2a', '#e8c0a0', 'toffee steam honey', 'cocoa'],
  ['mirrormix', 'Mira’s Mirror Mix', 'Look away, then look back quickly.', 'shiny cold magic', 'vial', '#bfd0e0', '#ffffff', 'mirror snowglobe', 'mira'],
  ['toffeetwist', 'Toffee Twist', 'Chewed thoughtfully for twenty minutes.', 'chewy sweet warm', 'flask', '#c07a28', '#ffd090', 'toffee chewybubble', 'butterscotch'],
  ['pebblepotion', 'Pebble Potion', 'Heavier than it has any right to be.', 'earthy grey soft', 'roundflask', '#8a8a92', '#d0d0d8', 'clay mushlamp', 'pebble'],
  ['blossombrew', 'Blossom Brew', 'Petals keep floating back to the top.', 'pretty sweet soft', 'vial', '#ff8ab0', '#fff0f8', 'rosepetal nectar', 'petal'],
  ['cometcordial', 'Comet Cordial', 'Leaves a trail across the bench.', 'bright loud sparkly', 'flask', '#4a8aff', '#d0e8ff', 'galaxy lightning', 'comet'],
  ['gigglegrog', 'Giggle Grog', 'Nobody has drunk it quietly yet.', 'silly loud green', 'roundflask', '#8ad88a', '#e8ffd8', 'laughter puffcap', 'giggles'],
  ['wispwater', 'Wisp Water', 'Clear, cool, and watching you.', 'spooky glowy cold', 'vial', '#a0d8e8', '#f0ffff', 'mirror shadow starlight', 'wisp'],
  ['honeydewhum', 'Honeydew Hum', 'Hums the same three notes all day.', 'sweet warm gold', 'flask', '#f0b82a', '#fff0a0', 'honeycomb sunflower', 'honeydew'],
  ['sparkspritz', 'Spark Spritz', 'One spray and the room crackles.', 'bright loud warm', 'vial', '#ff9a2a', '#fff0b0', 'sunspark lightning', 'spark'],
  ['nocturnenectar', 'Nocturne Nectar', 'Best opened after the lamps go out.', 'spooky sweet dark', 'roundflask', '#5a3a90', '#c0a0f0', 'nightjam shadow', 'noct'],
  ['coralcup', 'Coral Cup', 'Tastes of a warm shallow sea.', 'wet pretty soft', 'flask', '#ff8a7a', '#ffd8cc', 'brook rosepetal', 'coral'],
  ['juniperjuice', 'Juniper Juice', 'Sharp, sunny and a bit cheeky.', 'warm bright silly', 'vial', '#ff8a3a', '#ffd8a0', 'fairyfruit sunflower', 'june'],
  ['mallowmelt', 'Mallow Melt', 'Softer than the word soft.', 'soft sweet white', 'roundflask', '#fff0f0', '#ffd0e0', 'cottoncandy sorbet steam', 'mallow'],
  ['thistletincture', 'Thistle Tincture', 'Prickly on the outside only.', 'spiky cold pretty', 'flask', '#9a6ad8', '#e0c8ff', 'icicle fern', 'thistle'],
  ['auroramist', 'Aurora Mist', 'Green and pink ribbons, indoors.', 'glowy pretty cold', 'vial', '#4ad8b0', '#d8b0ff', 'raincloud prism', 'aurora'],
  ['clovercup', 'Clover Cup', 'Four leaves, every single time.', 'green soft glowy', 'roundflask', '#5ac85a', '#d8ffc0', 'glowmoss fern', 'clover'],
  ['cinnamonswirl', 'Cinnamon Swirl', 'Smells like the inside of a hug.', 'warm sweet earthy', 'flask', '#b06a3a', '#ffd0a0', 'roastcap caramel', 'cinnamon'],
  ['starlingsong', 'Starling Song', 'Plays a different tune each evening.', 'cold sparkly pretty', 'vial', '#4a5ad0', '#d0d8ff', 'starfrost galaxy', 'starling'],

  // ---------------------------------------------------- keepsakes (no pal)
  ['rainbowbottle', 'Rainbow Bottle', 'The whole arc, corked. Hangs in the window.', 'bright pretty magic', 'roundflask', '#ff7a7a', '#7ad8ff', 'rainbow bubble prism', '-'],
  ['wishjar', 'Wish in a Jar', 'One wish. Kept safe until you need it.', 'magic glowy sparkly', 'flask', '#ffe08a', '#ffb0e8', 'pixiedust galaxy candle', '-'],
];

// pal id | name | species | bio | body | colour | colour 2 | features
const RAW_PALS = [
  ['mossy', 'Mossy', 'moss slime', 'Hums while it waters the shelf plants.', 'slime', '#5ab85a', '#c0eaa0', 'leaf'],
  ['fizz', 'Fizz', 'soda sprite', 'Talks in bubbles. Very fast bubbles.', 'sprite', '#3ec8d8', '#d8fbff', 'wings'],
  ['cinder', 'Cinder', 'tiny dragon', 'Toasts your bread without being asked.', 'dragon', '#ff6a3a', '#ffd08a', 'wings horn'],
  ['nimbus', 'Nimbus', 'cloud kitten', 'Purrs, and it rains a tiny bit.', 'kitten', '#dfeaff', '#ffffff', 'puffy'],
  ['sprinkle', 'Sprinkle', 'sugar sprite', 'Leaves glitter on absolutely everything.', 'sprite', '#ff7ab8', '#fff0c8', 'wings crown'],
  ['glimmer', 'Glimmer', 'star sprite', 'Sleeps in the lamp when it is off.', 'sprite', '#ffd23a', '#fff8d0', 'wings star'],
  ['bramble', 'Bramble', 'thistle bug', 'Collects interesting twigs. Shows you each one.', 'bug', '#8a5a3a', '#d8ae7a', 'spikes antenna'],
  ['pudding', 'Pudding', 'caramel slime', 'Wobbles over for a cuddle, slowly.', 'slime', '#c88a40', '#ffd8a0', ''],
  ['snowpuff', 'Snowpuff', 'snow bunny', 'Makes tiny snowballs and hides them.', 'bunny', '#eaf4ff', '#ffffff', 'puffy'],
  ['bloop', 'Bloop', 'bubble fish', 'Swims about inside its own bubble.', 'fish', '#4ab868', '#c0f0c8', 'bubble'],
  ['pip', 'Pip', 'pantry mouse', 'Knows where every crumb in the house is.', 'mouse', '#a89a8a', '#e8e0d0', ''],
  ['zephyr', 'Zephyr', 'breeze bird', 'Rearranges the curtains for fun.', 'bird', '#3fc0b0', '#d0fff4', 'crest'],
  ['lumen', 'Lumen', 'lantern ghost', 'Floats ahead of you down dark stairs.', 'ghost', '#b088f0', '#f0d8ff', 'glow'],
  ['cocoa', 'Cocoa', 'cocoa bear', 'Always first to the fire, last to bed.', 'kitten', '#8a5a3a', '#d8a878', 'round'],
  ['mira', 'Mira', 'mirror sprite', 'Copies your wave, one second late.', 'sprite', '#c0d4e4', '#ffffff', 'wings shine'],
  ['butterscotch', 'Butterscotch', 'toffee slime', 'Sticks gently to your sleeve.', 'slime', '#c87a28', '#ffd090', ''],
  ['pebble', 'Pebble', 'garden rock pal', 'Sits very still, then surprises you.', 'slime', '#8a8a92', '#d0d0d8', 'spots'],
  ['petal', 'Petal', 'blossom sprite', 'Smells like the first warm day.', 'sprite', '#ff8ab0', '#fff0f8', 'wings crown'],
  ['comet', 'Comet', 'comet dragon', 'Does one loop of the room every hour.', 'dragon', '#4a8aff', '#d0e8ff', 'wings star'],
  ['giggles', 'Giggles', 'giggle ghost', 'Hides, snorts, gives itself away.', 'ghost', '#8ad88a', '#e8ffd8', ''],
  ['wisp', 'Wisp', 'window wisp', 'Watches the weather all evening.', 'ghost', '#a0d8e8', '#f0ffff', 'glow'],
  ['honeydew', 'Honeydew', 'honey bee pal', 'Brings one flower back every single day.', 'bug', '#f0b82a', '#fff0a0', 'wings stripes'],
  ['spark', 'Spark', 'firefly pal', 'Blinks twice when it agrees with you.', 'bug', '#ff9a2a', '#fff0b0', 'wings glow'],
  ['noct', 'Noct', 'moonberry bat', 'Hangs from the top shelf, upside down.', 'bird', '#7a52c0', '#c8a8f0', 'batwings'],
  ['coral', 'Coral', 'reef fish', 'Blows bubble rings to show off.', 'fish', '#ff8a7a', '#ffd8cc', 'bubble fins'],
  ['june', 'June', 'juniper fox', 'Steals one sock. Returns it, eventually.', 'kitten', '#ff8a3a', '#ffd8a0', 'fox'],
  ['mallow', 'Mallow', 'marshmallow slime', 'Squashes flat for a nap, pops back up.', 'slime', '#fff4f4', '#ffd0e0', ''],
  ['thistle', 'Thistle', 'frost thistle bug', 'Prickly looking, softest of them all.', 'bug', '#9a6ad8', '#e0c8ff', 'spikes antenna'],
  ['aurora', 'Aurora', 'aurora dragon', 'Trails green and pink when it yawns.', 'dragon', '#4ad8b0', '#d8b0ff', 'wings crest'],
  ['clover', 'Clover', 'clover bunny', 'Finds four leaves, every single time.', 'bunny', '#5ac85a', '#d8ffc0', 'leaf'],
  ['cinnamon', 'Cinnamon', 'spice mouse', 'Smells faintly of warm buns.', 'mouse', '#b06a3a', '#ffd0a0', 'round'],
  ['starling', 'Starling', 'night starling', 'Sings the same tune the stars do.', 'bird', '#4a5ad0', '#d0d8ff', 'crest star'],
];

function buildItem(row) {
  const [id, name, blurb, tags, shape, c1, c2, from, pal] = row;
  const inputs = from ? from.split(' ') : [];
  return {
    id,
    name,
    blurb,
    tags: tags.split(' '),
    shape,
    c1,
    c2,
    inputs,
    kind: inputs.length === 0 ? 'base' : pal ? 'potion' : 'item',
    pal: pal && pal !== '-' ? pal : null,
  };
}

export const ITEMS = RAW.map(buildItem);
export const ITEM = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
export const BASES = ITEMS.filter((it) => it.kind === 'base').map((it) => it.id);
export const DISCOVERIES = ITEMS.filter((it) => it.kind !== 'base').map((it) => it.id);
export const POTIONS = ITEMS.filter((it) => it.kind === 'potion').map((it) => it.id);

export const PALS = RAW_PALS.map(([id, name, species, bio, body, c1, c2, feats]) => ({
  id, name, species, bio, body, c1, c2, feats: feats ? feats.split(' ') : [],
}));
export const PAL = Object.fromEntries(PALS.map((p) => [p.id, p]));

// The multiset key for a brew: ids sorted, so order never matters.
export function keyOf(ids) {
  return [...ids].sort().join('+');
}

// key -> result id
export const RECIPES = (() => {
  const map = new Map();
  for (const it of ITEMS) if (it.inputs.length) map.set(keyOf(it.inputs), it.id);
  return map;
})();

export function resultOf(ids) {
  return RECIPES.get(keyOf(ids)) || null;
}

// Which recipes use an ingredient. Built once; the book and the hint writer
// both walk it.
export const USES = (() => {
  const map = new Map();
  for (const it of ITEMS) {
    for (const input of new Set(it.inputs)) {
      if (!map.has(input)) map.set(input, []);
      map.get(input).push(it.id);
    }
  }
  return map;
})();

// Branch pages for the discovery book. An item belongs to the first branch
// whose tag it carries, so every discovery lands on exactly one page.
export const BRANCHES = [
  { id: 'potions', name: 'Potions', tag: null },
  { id: 'sweet', name: 'Sweet Shelf', tag: 'sweet' },
  { id: 'cold', name: 'Cold Shelf', tag: 'cold' },
  { id: 'warm', name: 'Warm Shelf', tag: 'warm' },
  { id: 'glowy', name: 'Glowing Shelf', tag: 'glowy' },
  { id: 'green', name: 'Garden Shelf', tag: 'green' },
  { id: 'silly', name: 'Silly Shelf', tag: 'silly' },
  { id: 'odds', name: 'Odds & Ends', tag: null },
];

export function branchOf(id) {
  const it = ITEM[id];
  if (!it) return 'odds';
  if (it.kind === 'potion') return 'potions';
  for (const b of BRANCHES) if (b.tag && it.tags.includes(b.tag)) return b.id;
  return 'odds';
}

// Everything reachable from a set of known ids, by repeatedly applying recipes
// whose inputs are all known. Used by the tests and by the hint writer.
export function reachableFrom(known = BASES) {
  const have = new Set(known);
  let grew = true;
  while (grew) {
    grew = false;
    for (const it of ITEMS) {
      if (!it.inputs.length || have.has(it.id)) continue;
      if (it.inputs.every((i) => have.has(i))) {
        have.add(it.id);
        grew = true;
      }
    }
  }
  return have;
}

// Recipes whose every input is already known but whose result is not: the
// things a player could find right now.
export function frontier(known) {
  const out = [];
  for (const it of ITEMS) {
    if (!it.inputs.length || known.has(it.id)) continue;
    if (it.inputs.every((i) => known.has(i))) out.push(it.id);
  }
  return out;
}
