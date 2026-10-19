// Target words and their kid-friendly glosses. Only words in this list can
// be a level's crossword answers; everything here is also a valid bonus word.
//
// One word per line: `word: gloss`. A `+` after the word (`pot+: ...`) also
// makes its plain plural (`pots`) a target word, glossed "More than one pot."
// Keep glosses short, friendly and true. The tests check that every word is
// lowercase a–z, 3–7 letters, unique, and not on the blocklist.
export const GLOSS_TEXT = `
act: To pretend in a play or a show
add: To put numbers together
age: How old someone is
aid: Help given to someone
aim: To point at a target
air: What we breathe all around us
ant+: A tiny insect that lives in a big colony
ape+: A big animal like a gorilla or a chimp
arc: A curved line, like part of a circle
arm+: The part of your body between shoulder and hand
art+: Drawings, paintings and other things people make
ask: To say a question
ate: Had food, as in "I ate lunch"
bag+: A sack for carrying things
bat+: A stick to hit a ball, or a flying night animal
bay+: Part of the sea that curves into the land
bed+: Where you sleep at night
bee+: A buzzing insect that makes honey
bib+: A cloth that keeps babies clean while eating
big: Large in size
bin+: A box for keeping or tossing things
bit+: A small piece
bow+: A ribbon tied in loops, or to bend forward
box: A container with flat sides
boy+: A young male child
bud+: A flower before it opens
bug+: A small crawling insect
bun+: A small round bread
bus: A big vehicle that carries lots of people
cab+: A taxi car
can+: A metal container, or to be able to
cap+: A hat with a brim at the front
car+: A vehicle with four wheels
cat+: A furry pet that says meow
cob+: The middle part of an ear of corn
cod: A fish that lives in cold seas
cot+: A small bed
cow+: A farm animal that gives milk
cry: To have tears fall from your eyes
cub+: A baby bear, lion or fox
cup+: A small container you drink from
cut: To split with scissors
dad+: Father
day+: The time when the sun is up
den+: A cozy home for a wild animal
dew: Tiny drops of water on grass in the morning
dig: To make a hole in the ground
dim: Not very bright
dip: To dunk quickly into a liquid
doe+: A mother deer
dog+: A furry pet that barks
dot+: A small round spot
dry: Not wet
ear+: What you hear with
eat: To have food
eel+: A long, slippery fish
egg+: What a bird or a turtle hatches from
elf: A tiny magical helper in stories
elk: A large deer
emu+: A tall bird that cannot fly
end+: The very last part
ewe+: A mother sheep
eye+: What you see with
fan+: Something that blows cool air
far: A long way away
fed: Gave food to
fig+: A soft, sweet fruit
fin+: The flat part a fish swims with
fit: The right size, or strong and healthy
fix: To mend something broken
fly: To move through the air
fog: A cloud close to the ground
fox: A wild animal with a bushy tail
fun: Something you enjoy
fur: Soft hair on an animal
gap+: A space between two things
gem+: A shiny precious stone
gum: A chewy sweet
hat+: Something you wear on your head
hay: Dried grass that horses eat
hen+: A mother chicken
hid: Stayed out of sight
hip+: Where your leg joins your body
hop+: A small jump
hot: Very warm
hug+: Holding someone close with your arms
hum: To sing with your lips closed
hut+: A small, simple house
ice: Frozen water
inn+: A small, cozy hotel
ink: Colored liquid for writing
jam: Sweet fruit spread
jar+: A glass container with a lid
jet+: A fast airplane
jog: To run slowly
joy: A feeling of great happiness
kid+: A child, or a baby goat
kit+: A set of tools or parts
lab+: A room for science experiments
lap+: Your top legs when sitting, or once around a track
leg+: What you walk with
lid+: The top cover of a box or jar
lip+: The edge of your mouth
lit: Glowing with light
log+: A big piece of a tree trunk
lot+: A large amount
low: Close to the ground
map+: A drawing that shows where places are
mat+: A small rug
met: Got to know someone
mix: To stir things together
mom+: Mother
mop+: A tool for washing floors
mud: Wet, squishy dirt
mug+: A big cup with a handle
nap+: A short sleep
net+: A mesh used to catch fish
new: Just made, not old
nod+: Moving your head up and down for yes
now: At this moment
nut+: A seed with a hard shell
oak+: A big tree that grows acorns
oar+: A paddle for rowing a boat
oat+: A grain for making porridge
odd: Strange, or a number like 1, 3 or 5
old: Not new or young
one: The number 1
ore: Rock with metal inside it
owl+: A bird that hoots at night
own: To have something as yours
pad+: A soft cushion, or a pile of paper
pal+: A friend
pan+: A flat pot for cooking
pat: To tap gently
paw+: An animal's foot
pea+: A small, round green vegetable
pen+: A tool for writing with ink
pet+: An animal friend who lives with you
pie+: A baked dish with a crust and a filling
pig+: A pink farm animal that oinks
pin+: A thin metal stick with a point
pit+: A hole, or the stone in a fruit
pod+: A shell that holds peas, or a group of whales
pop: A small bursting sound
pot+: A deep pan for cooking
pup+: A baby dog or seal
rag+: An old cloth for cleaning
ram+: A male sheep
ran: Went fast on your feet
rat+: A rodent with a long tail
raw: Not cooked
ray+: A beam of light, or a flat sea fish
red: The color of strawberries
rib+: One of the bones around your chest
rim+: The outside edge of something round
rod+: A long, thin stick
row+: A line of things, or to paddle a boat
rub: To press and move your hand back and forth
rug+: A soft cover for the floor
run: To move fast on your feet
sad: Not happy
sap: Sticky juice inside a tree
sat: Rested on a seat
saw: A tool for cutting wood, or looked
sea+: A huge body of salty water
see: To look with your eyes
set+: A group of things that go together
sew: To stitch with a needle and thread
shy: Quiet and a little nervous around others
sip+: A tiny drink
sit: To rest on a seat
six: The number 6
ski+: A long board for sliding on snow
sky: The space above the earth
sly: Sneaky and clever
son+: Someone's boy child
sow: To plant seeds
spy: Someone who watches secretly
sum+: The answer when you add numbers
sun: The bright star that lights our day
tab+: A small flap or label
tag+: A chasing game, or a label
tan: A light brown color
tap+: A faucet, or a light touch
tar: Thick, black, sticky stuff for roads
tea+: A warm drink made from leaves
ten: The number 10
tie+: A knot, or a draw where both sides score the same
tin: A shiny gray metal
tip+: The pointy end of something
toe+: One of the five digits on your foot
ton+: A very big weight
top+: The highest part
tot+: A little child
tow: To pull something along behind
toy+: Something to play with
tub+: A wide container, like a bathtub
tug+: A hard pull
two: The number 2
van+: A big car for carrying things
vet+: An animal doctor
wag: To swing a tail back and forth
wax: What candles and crayons are made of
way+: A path or a road
web+: A net spun by a spider
wet: Covered with water
wig+: A cap of pretend hair
win+: To come first in a game
wok+: A round pan for stir-frying
won: Came first in a game
yak+: A hairy ox with long horns
yam+: A sweet root vegetable
yes: The opposite of no
zap: A quick zing of energy
zip: To close a zipper
zoo+: A park where animals live

able: Can do something
acorn+: The nut of an oak tree
acre+: A big piece of land
arch: A curved shape over an opening
area+: A space or a part of a place
aunt+: Your mom or dad's sister
baby: A very young child
back: The part of your body behind you
bake: To cook in an oven
ball+: A round toy you throw, kick or bounce
band+: A group that plays music together
bank+: The side of a river
bark: The sound a dog makes, or a tree's skin
barn+: A big farm building for animals
bath: A wash in a tub of water
bead+: A small ball with a hole for threading
beak+: A bird's hard mouth
bean+: A seed you can eat, like a green bean
bear+: A big furry animal
beat: A steady rhythm, like a drum
bell+: It rings when you shake it
belt+: A strap worn around your waist
best: Better than all the rest
bike+: A bicycle
bird+: An animal with feathers and wings
blue: The color of the clear sky
boat+: Something that floats and carries people on water
bone+: A hard part inside your body
book+: Pages with words or pictures to read
boot+: A tall shoe
bowl+: A round dish for soup or cereal
bulb+: A lamp's light, or a plant root like an onion
cake+: A sweet baked treat for parties
calm: Peaceful and quiet
camp+: A place where you sleep in tents
card+: A folded paper with a message
care: To look after someone
cart+: A small wagon
cave+: A big hole in a hill or a rock
clam+: A sea animal with two shells
clap+: Hitting your hands together
claw+: A sharp, curved nail on an animal's foot
coat+: Something warm you wear over clothes
code+: A secret way of writing
coin+: A round piece of metal money
cold: Not warm at all
cone+: A shape with a point, like an ice cream cone
cook+: Someone who makes food
cool: A little cold, or really great
core+: The middle of an apple
corn: A tall plant with yellow kernels
cove+: A small, sheltered bay
crab+: A sea animal with claws that walks sideways
crow+: A big black bird
cube+: A shape like a box with six square sides
cute: Sweet and lovely to look at
dare: To challenge someone to try something
dart+: A small pointed arrow
dash: To run fast
date+: A day on the calendar, or a sweet fruit
dear: Loved very much
deer: A forest animal; the males have antlers
desk+: A table for writing and working
dice: Cubes with dots used in games
dime+: A coin worth ten cents
dine: To eat dinner
dish: A plate or a bowl
dive+: A jump into water, head first
dock+: A place where boats tie up
doll+: A toy that looks like a person
door+: You open it to go into a room
dove+: A soft gray bird of peace
down: Toward the ground
drum+: You beat it to make music
duck+: A water bird that quacks
dune+: A hill of sand
dust: Tiny bits of dirt
each: Every one
earn: To get something by working
east: The way the sun rises
easy: Not hard
eats: Has food
edge+: The side or rim of something
edit: To fix and change writing
face+: The front of your head
fair: Fun and the same for everyone
farm+: Land for growing food and keeping animals
fast: Very quick
fern+: A leafy plant with no flowers
fish: An animal that swims and breathes underwater
five: The number 5
flag+: A colored cloth on a pole
flat: Smooth and level
flip+: A quick turn over
flow: To move along like a river
foam: Lots of tiny bubbles together
fold: To bend paper or cloth over
food: What you eat
foot: What you stand on
fork+: A tool with prongs for eating
fort+: A strong building, or a blanket hideout
four: The number 4
frog+: A green animal that hops and croaks
game+: Something you play for fun
gate+: A door in a fence
gift+: A present
glow: To shine with a soft light
glue: Sticky stuff that holds things together
goal+: Something you try to reach
goat+: A farm animal with horns that loves to climb
gold: A shiny yellow metal
good: Nice, or well done
grin+: A big smile
grow: To get bigger
gull+: A seabird
hair: What grows on your head
half: One of two equal parts
hand+: The part of your arm with fingers
harp+: A big instrument with strings you pluck
heal: To get better
heat: Hotness
help: To make things easier for someone
herb+: A plant used to flavor food
hero: Someone brave who helps others
hide: To go where no one can see you
hike+: A long walk outdoors
hill+: A small mountain
hint+: A little clue
hive+: A home for bees
hole+: An opening, or a dug-out space
home+: The place where you live
hood+: A soft cover for your head on a coat
hoof: The hard foot of a horse
hook+: A curved piece for hanging things
hoop+: A big ring
hope: To wish for something
horn+: A hard point on an animal's head, or a loud instrument
hose+: A long tube that sprays water
hour+: Sixty minutes
idea+: A thought or a plan
inch: A small length, about the tip of a thumb
iron: A strong metal
item+: One thing on a list
jump+: A push off the ground into the air
keep: To hold on to
kelp: A big seaweed that grows like a forest
kind: Nice and caring
king+: A man who rules a kingdom
kite+: A toy that flies in the wind on a string
knot+: A tie in a rope
lake+: A big pool of fresh water
lamb+: A baby sheep
lamp+: A light for a room
land: The ground, not the sea
lane+: A narrow road
last: At the very end
late: After the right time
leaf: A flat green part of a plant
lean: To rest against something
leap+: A big jump
lime+: A small, green, sour fruit
line+: A long, thin mark
lion+: A big wild cat with a mane
list+: Words written one after another
loaf: A whole bread
lock+: It keeps a door shut; a key opens it
loud: Making lots of noise
love: A warm, caring feeling
made: Built or created
mail: Letters and parcels
make: To build or create
mane+: Long hair on a lion's or horse's neck
mask+: A cover for your face
mast+: The tall pole that holds a ship's sail
mate+: A friend or partner
maze+: A puzzle of winding paths
meal+: Food you eat at one time
meat: Food that comes from animals
melt: To turn from solid to liquid
mile+: A long distance
milk: A white drink that comes from cows
mint+: A plant with a fresh, cool taste
mist: A light, thin fog
mole+: A small animal that digs tunnels
moon+: It shines in the night sky
moss: A soft green plant that grows on rocks
moth+: A night insect like a butterfly
mule+: Part horse, part donkey
nail+: A fingernail, or a thin metal pin you hammer
name+: What someone or something is called
near: Close by
neat: Tidy and clean
neck+: It joins your head to your body
nest+: A home that birds build
newt+: A small lizard-like animal that loves water
nice: Kind and pleasant
nine: The number 9
nose+: What you smell with
note+: A short letter, or a musical sound
oven+: A hot box for baking
pack+: A bag you carry on your back
page+: One side of a sheet in a book
pail+: A bucket
pair+: Two things that go together
pale: Light in color
palm+: A tropical tree, or the inside of your hand
park+: An outdoor place to play
part+: A piece of something
past: The time before now
path+: A little trail to walk on
peak+: The pointy top of a mountain
pear+: A sweet fruit shaped like a bell
pier+: A walkway built out over the water
pine+: A tree with needles and cones
pink: A light red color
pipe+: A tube for water or air
plan+: An idea of what to do
play: To have fun
plum+: A small purple fruit
pond+: A small lake
pony: A small horse
pool+: A big tub of water for swimming
port+: A town where ships come in
post+: A pole stuck in the ground, or the mail
pour: To tip liquid out
puff+: A small breath of air
pull: To bring toward you
pump+: A machine that pushes air or water
race+: A contest to see who is fastest
raft+: A flat floating boat
rain: Water falling from clouds
rake+: A garden tool with long teeth
ramp+: A slope
rate: How fast something happens
read: To look at words and understand them
reef+: A ridge of coral under the sea
rest: To relax and be still
rice: Tiny grains you cook and eat
ride+: A trip on a bike, a horse or a train
ring+: A circle you wear on your finger
ripe: Ready to eat
rise: To go up
road+: A street for cars
roar+: A loud, deep sound like a lion makes
robe+: A long, loose coat
rock+: A hard piece of stone
roof+: The top cover of a house
room+: A space inside a building
root+: The part of a plant that grows underground
rope+: A thick, strong string
rose+: A pretty flower with thorns
ruby: A red gemstone
sail+: A big cloth that catches wind to move a boat
sale+: A time when things cost less
salt: White grains that make food taste salty
same: Just like the other one
sand: Tiny bits of rock on the beach
seal+: A sea animal with flippers that barks
seat+: Something to sit on
seed+: A tiny thing that grows into a plant
ship+: A big boat
shoe+: Something you wear on your foot
shop+: A store
sing: To make music with your voice
sink+: A basin with a tap
skip: To hop along happily
slow: Not fast
snow: Frozen flakes that fall from clouds
soap: It makes bubbles and gets you clean
sock+: A soft cover for your foot
soft: Gentle to touch
song+: Music with words to sing
soup+: A warm, runny food in a bowl
spin+: A turn around and around
spot+: A small mark or place
star+: A bright light in the night sky
stem+: The stalk of a plant
step+: A move with your foot, or a stair
stew+: A thick soup cooked slowly
stir: To mix with a spoon
stop: To not go anymore
surf: Waves breaking on the shore
swan+: A white water bird with a long neck
swim+: A trip through the water
tail+: The part at the back of an animal
tale+: A story
tame: Gentle, not wild
tank+: A big container for water or fish
tape: A sticky strip
team+: A group working together
tear+: A drop of water from your eye
teal: A blue-green color
tent+: A cloth shelter for camping
tide+: The rise and fall of the sea
time: What clocks measure
tiny: Very, very small
toad+: A bumpy animal like a frog
town+: A place where people live, smaller than a city
trap+: Something that catches
tree+: A tall plant with a trunk and branches
trip+: A journey
tuba+: A big brass horn that plays low notes
tube+: A long, hollow pipe
tuna: A large ocean fish
turn+: Your go in a game, or to go around
twig+: A tiny branch
vase+: A pot for flowers
vest+: A jacket with no sleeves
view+: What you can see
vine+: A plant that climbs
wade: To walk through water
wake: To stop sleeping
walk+: A trip on foot
wall+: A side of a room or a building
wand+: A magic stick
warm: A little hot
wash: To clean with water
wave+: Moving water in the sea, or a hand saying hello
weed+: A wild plant growing where it is not wanted
well+: A deep hole for water
west: The way the sun sets
wind+: Moving air
wing+: What birds fly with
wise: Knows a lot and makes good choices
wish: To hope for something
wolf: A wild dog that howls
wood+: What trees are made of
wool: Soft hair from a sheep
word+: Letters put together that mean something
work: A job or a task
worm+: A long, wiggly creature in the soil
wrap: To cover all around
yard+: The grass around a house
yarn+: Thread for knitting
year+: Twelve months
yell: To shout loudly
yolk+: The yellow part of an egg
zero: The number 0
zone+: An area

actor+: Someone who acts in plays or films
apple+: A crunchy fruit, red or green
apron+: A cloth worn to keep clothes clean while cooking
arrow+: A pointed stick shot from a bow
badge: A pin you wear to show something you did
bagel+: A round bread with a hole
beach: Sandy land by the sea
beard+: Hair on a chin
berry: A small, juicy fruit
bloom+: A flower that has opened
board+: A flat piece of wood
bread: A food baked from flour
brick+: A hard block for building walls
broom+: A brush for sweeping
brush: Bristles on a handle for hair or paint
cabin+: A small wooden house
camel+: A desert animal with humps
candy: A sweet treat
canoe+: A narrow boat you paddle
chair+: A seat with a back
chalk: A soft white stick for drawing on boards
cheap: Costs only a little
cheer+: A happy shout for someone
chest: The front of your body, or a treasure box
chick+: A baby bird
chime+: A ringing sound like a bell
clean: Not dirty
cliff+: A tall, steep rock face
cloud+: Fluffy white shapes in the sky
clown+: A funny performer at a circus
coast+: Where the land meets the sea
coral+: Colorful stony reefs built by tiny sea animals
crane+: A tall bird, or a machine that lifts heavy things
crown+: A king's or queen's golden hat
dance+: Moving to music
daisy: A small white flower with a yellow middle
dream+: Pictures and stories in your sleep
drink+: Something to sip, like water or juice
eagle+: A big bird with sharp eyes
earth: Our planet, or soil
easel+: A stand that holds a painting
eight: The number 8
elbow+: The bend in the middle of your arm
fairy: A tiny magical being with wings
feast+: A big special meal
field+: An open area of grass
flame+: The bright part of a fire
float+: A thing that stays on top of water
flock+: A group of birds or sheep
flour: Powder from grain used to bake bread
flute+: A thin instrument you blow across
fruit: Sweet food that grows on plants
giant+: Someone or something very, very big
globe+: A ball-shaped map of the world
glove+: A cover for your hand with fingers
goose: A big water bird that honks
grape+: A small round fruit that grows in bunches
grass: Green plants that cover a lawn
green: The color of grass
heart+: It beats inside your chest; also a shape that means love
honey: Sweet golden food made by bees
horse+: A big animal you can ride
house: A building where people live
igloo+: A house made of snow blocks
jelly: A wobbly sweet food
juice: A drink squeezed from fruit
kayak+: A small, narrow boat you paddle
koala+: A furry tree animal from Australia
least: The smallest amount
lemon+: A sour yellow fruit
light+: What lets you see; also not heavy
llama+: A woolly animal from South America
lunch: A meal in the middle of the day
magic: Tricks and wonders
mango: A juicy tropical fruit
maple+: A tree with leaves that turn red
melon+: A big, juicy fruit
mouse: A tiny animal with a long tail
music: Sounds that make a tune
night+: The dark time when you sleep
nurse+: Someone who cares for sick people
ocean+: A huge, salty sea
olive+: A small green or black fruit
onion+: A vegetable with layers that can make you cry
otter+: A playful animal that floats on its back
paint+: Colored liquid for making pictures
panda+: A black and white bear that eats bamboo
paper+: Thin sheets for writing and drawing
party: A happy get-together
pasta: Noodles
peach: A soft, fuzzy fruit
pearl+: A shiny gem made inside an oyster
petal+: One of the colored parts of a flower
piano+: A big instrument with black and white keys
pilot+: Someone who flies a plane
pizza+: Flat bread with sauce and cheese
plant+: A living thing that grows in soil
plate+: A flat dish for food
prize+: Something you win
puppy: A baby dog
queen+: A woman who rules a kingdom
quiet: Not loud
raven+: A big black bird
river+: Fresh water flowing to the sea
robin+: A bird with a red chest
robot+: A machine that can move and do jobs
salad+: Mixed vegetables to eat
scale+: A flat plate on a fish, or a tool for weighing
scarf: A long cloth for a warm neck
shark+: A big fish with sharp teeth
sheep: A woolly farm animal
shell+: A hard cover that protects sea animals
shine: To give off bright light
shore+: The land along the edge of the sea
skate+: A shoe with a blade or wheels
slate+: A flat gray rock
sleep: To rest with your eyes closed
slide+: Something you whoosh down at a playground
smile+: A happy face with lips curved up
snack+: A small bite of food
snail+: A slow critter with a shell on its back
snake+: A long animal with no legs
spare: Extra, kept just in case
spear+: A long, pointed pole
spoon+: A tool with a bowl shape for eating soup
squid: A sea animal with ten arms
stamp+: A sticker for mail
steam: Hot mist from boiling water
stone+: A small rock
storm+: Wind, rain and thunder
story: A tale that tells what happened
sugar: Sweet white grains
swing+: A seat that moves back and forth
table+: Furniture with legs and a flat top
teeth: What you bite and chew with
thing+: An object
tiger+: A big orange cat with stripes
toast: Bread browned with heat
tooth: One of the hard white bones in your mouth
torch: A light you carry
tower+: A tall, narrow building
trade+: A swap
train+: Cars on a track pulled by an engine
treat+: Something special and nice
truck+: A big vehicle for carrying loads
tulip+: A cup-shaped spring flower
uncle+: Your mom or dad's brother
water: Clear liquid we drink
whale+: The biggest animal in the sea
wheat: A grain used to make flour
wheel+: A round thing that rolls
world: The Earth and everyone on it
zebra+: A horse-like animal with stripes

anchor+: A heavy hook that keeps a ship in place
animal+: A living thing that moves and breathes
autumn: The season when leaves fall
banana+: A long yellow fruit
basket+: A woven container for carrying things
beetle+: An insect with a hard, shiny shell
bottle+: A container for drinks
branch: An arm of a tree
breeze: A gentle wind
bubble+: A floating ball of air in soapy water
bucket+: A pail for carrying water or sand
butter: A creamy spread made from milk
button+: A small round thing that fastens clothes
camera+: A tool for taking pictures
candle+: Wax with a wick that gives light
carrot+: An orange vegetable that rabbits love
castle+: A big stone home with towers
cookie+: A small, sweet baked treat
cotton: Soft, fluffy fiber used for clothes
crayon+: A wax stick for drawing
dinner+: The evening meal
doctor+: Someone who helps sick people get well
donkey+: An animal like a small horse with long ears
dragon+: A huge storybook creature with wings
flower+: The colorful bloom of a plant
forest+: Lots of trees growing together
friend+: Someone you like and trust
garden+: A place where flowers and vegetables grow
gentle: Soft and kind
guitar+: An instrument with strings you strum
hammer+: A tool for hitting nails
harbor+: A safe place where ships stay
island+: Land with water all around it
jacket+: A short coat
jungle+: A thick, hot forest
kitten+: A baby cat
ladder+: Steps for climbing up
lagoon+: A calm pool of seawater beside the sea
lizard+: A small reptile with a long tail
magnet+: It pulls metal toward it
marble+: A small glass ball, or a smooth stone
meadow+: A field of grass and flowers
minnow+: A tiny fish
mitten+: A glove without separate fingers
monkey+: A playful animal that climbs trees
orange+: A round, juicy fruit, or its color
oyster+: A sea animal with a shell that can make pearls
parrot+: A colorful bird that can copy words
pebble+: A small, smooth stone
pencil+: A tool for writing and drawing
picnic+: A meal eaten outside
pillow+: A soft cushion for your head
planet+: A big world that circles a star
pocket+: A small pouch sewn into clothes
puddle+: A small pool of rainwater
puffin+: A seabird with a bright beak
rabbit+: A furry animal with long ears that hops
ribbon+: A strip of pretty cloth
ripple+: A small wave on water
rocket+: A ship that blasts into space
sailor+: Someone who works on a ship
salmon: A pink fish that swims up rivers
school+: Where you go to learn
silver: A shiny gray metal
spider+: A small animal with eight legs that spins webs
splash: Water flying up
spring: The season when flowers bloom
square+: A shape with four equal sides
stream+: A small river
summer: The warmest season
sunset+: When the sun goes down in the evening
teapot+: A pot for making tea
thread: A thin string for sewing
ticket+: A paper that lets you in
tomato: A red, juicy fruit used in salads
travel: To go on a trip
turtle+: A sea or land animal with a shell
urchin+: A spiky, ball-shaped sea animal
violin+: A wooden instrument played with a bow
walrus: A big sea animal with long tusks
wander: To walk around slowly
window+: A glass opening in a wall
winter: The coldest season
yellow: The color of the sun and bananas

anemone: A soft sea animal that looks like a flower
balloon+: A rubber bag filled with air
blanket+: A warm cover for your bed
captain+: The leader of a ship
chicken+: A farm bird that lays eggs
coconut+: A big, hard nut from a palm tree
current: A river of moving water in the sea
dolphin+: A smart, playful sea animal that breathes air
explore: To travel to find new things
flipper+: A flat limb for swimming
giraffe+: The tallest animal, with a long neck
journey: A long trip
kitchen+: The room where food is cooked
lantern+: A light you can carry
library: A place full of books to borrow
lobster+: A sea animal with big claws
manatee+: A gentle, slow sea cow
mermaid+: A storybook sea person with a fish tail
morning+: The early part of the day
narwhal+: A whale with a long, swirly tusk
octopus: A sea animal with eight arms
painter+: Someone who paints pictures
penguin+: A bird that swims but cannot fly
popcorn: A puffy, crunchy corn snack
pumpkin+: A big orange squash
rainbow+: A colorful arc in the sky after rain
seagull+: A seabird that lives by the shore
seaweed: Plants that grow in the sea
sparkle: To shine with little flashes of light
sunrise: When the sun comes up
tadpole+: A baby frog with a tail
teacher+: Someone who helps you learn
thunder: The loud boom after lightning
unicorn+: A storybook horse with one horn
volcano: A mountain that can burst with hot lava
weather: What it is like outside: rain, sun or snow
whistle+: A little thing you blow to make a high sound
`;
