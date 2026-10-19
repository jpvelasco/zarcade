// Extra kid-safe words accepted as bonus finds. Every target word (see
// glosses.js) is accepted too, so this list only holds the extras: everyday
// words, plurals and verb forms. Space or newline separated, lowercase,
// 3–7 letters. The tests run every word through the blocklist.
export const BONUS_TEXT = `
ace aces acts adds ado ads aft ages aged ago ahead aids aims airs airy alike alive all allow ally alone along aloud also alter amp and angle angles
ankle another ankles answer any apart apes apt arcs are arise arose armor army
around art ash ashes aside asked asks atom attic auto avid awake award aware away
awe awoke axe axes axle aye

bad bake baked baker bakes bale bales ban bang banks bare bark barked barks
base based bat bats bay bead beam beams beans bear beast bed beds been beg
began begin begun being bend bends bent beside bid bike bin bind bins
bird bit bite bites blade bland blank blast blaze bled blend bless blew
blink blob block blot blow blows blown boa boar boast bob body bog boil bold
bolt bond bony boo boom boost bore born borrow boss both bound bow bows box
boxes brain brake brand brave bred brew brine bring brink brisk broke brook
brow brown bud buds build built bulk bump bumps bunch bunk buns burn burst bush
bushes busy but buy buys buzz bye

cabs cage cake call calls calm came camp can cane canes cans cape capes
caps care cared cares carry cars cart case cash cast cat cater cats cause
cell cent cents chain chair champ chant chap chat chats check cheek chew chin
chip chips chop chops chose chosen city clad clan clasp class clay clever click
climb cling clip clock close cloth clue clump coal coin cola colt comb come
comes coming cone cop cope copy cord cork cot cots could count court cover
cows cozy crack craft cram crate crawl crazy cream creek crew crib crisp crop
cross crowd crumb crust cue cups curb curl cut cuts cycle

dab dads daily dam damp dare dared dark darn dash data dawn days deal deals dealt
dear decks deed deep deeds den dens dent deny dew did diet dig digs dim
dine diner ding dip dips dirt dirty dish ditch dive diver dives do dock does doe
doer dog dogs doing dome done dose dot dots dote dove doves drab drag drain
drama drank draw drawn draws dread dried drier dries drift drip drips drive
drop drops drove dry dub due dug dull dump dusk duty dye dyed

each eager ear early earn ears ease east eaten eater eaves ebb echo edge
eel elm else emit empty end ended ends enjoy enter entry equal era even
event ever every exact exit extra eye eyed eyes

fad fade faded fails faint fair fake fame fan fang fangs far fare fast fasts
fate fear feat fee feed feel feels fees feet fell felt fence fetch few fib
file fill film find fine fire firm first fist fits five fizz flake flap flash
flew flies fling flint flit floor flop floss flu flue fly foal foe foes fond
font for fore forget form forms fort foul found fox frame free
fresh fries frost froze fry full fun fund fuss fuzz

gain gal gale gap gas gasp gave gaze gear gee gel gems get gets girl give
given glad glade glare glass glee glen glide glint gloom glory glow gnat gnaw
gnome goes going golf gone goo gown grab grain grand grant grasp grate
gravy gray graze great greet grew grid grill grip groan groom grove
grub gulf gum guppy gust guy guys

had hail hall halo halt ham hang hard hare harm has hash haste hatch haul have
hawk hay haze hazy head heads heap hear heard hears heat heats heave heel heels
held hello helm hem hen her herd here hers hey hid hike hiker him hinge hip hire
his hit hits hive hold holds holy hone hop hope hoped hopes hops horse hose
host hotel how howl hub hue huge hum hump hung hunk hurry hush hymn

icy ink inks inn into ion its itch ivy

jade jaw jaws jay jeans jeep jest jig jog join joke joked jokes jolly jot
joys judge jug just

keel keen keg kept key keys kin kind kiss kit kits knee knees knew knit
knob knock know known

lace lad lads lady laid lain lake lamp lance lane lap large lark lash last
latch later laugh lawn lay lays lead leads leak leaks lean leans leant learn
lease leash led ledge lee lend lens lent less lest let lets level lick lids lie
life lift like liked likes lily limb limp lint lip lit live lived lives
load loads loan lob lobe local lodge loft lone long look looks loom loop loose
lore lose loss lost lot loud lounge low lower loyal luck lucky lug lull lure
lush

mad made magpie maid mail main major make maker makes male mall malt mane
many mar march mare mark marks marsh mash mask mat match mate maze meal mean
meant meats mend mesh mess met metal mice mild mile mill mime mind mine mines
miss mite mitt mix moan moat mode moist mold mole mood moon moor moose mop
more most moth motor mound mount mouth move moved moves mow mower mown much mud
mule muse must mute

nab nag name named names nap near nearly nears neat need needs nest net never
newer news next nib nice nick nip nips nod node noise none nook noon nor norm
north nose not notch note noted nothing now nudge null numb

oath oats obey ocean odd odds off offer often oil oily okay old older omit
once one ones only onto onset ooze open opened opt opts oral orbit order ore
other ouch ought ounce our ours out oval over owe owes owing owl owls own owned
owner owns

pace pack pact pad pads paid pail pain pal pale palm pan pane pans pant pants
par pare parse pass paste pat patch pats pause pave paved paw pawn paws pay peace
peal peat peck pedal peek peel peep peer pelt pen pens pert pest pets pew pick
pie pier piles pin pinch pins pint pit pita pity place plain plan plane plank
plea plead pleat plod plot plow ploy plug plump plus ply poem poet point poke
pole pond pony pool poor pop pore pose posh post posted pot pots pout praise
prance press price pride print prior prod prop proud prove prune pry puff
pug pull pulp pupil pups pure purr push put

quack quest quick quill quilt quit quite quiz

race racer rack radio rag raid rail rain raise raked ram ran ranch rang range
rank rant rare rash rat rate rated rates rather rattle rave raw ray rays reach
react read ready real realm ream reap rear red redo reed reel reins relax rely
rent repay reply rest rib rice rich rid ride rider rig right rim rind ring rink
rinse rip ripen rise risen risk roam roast robe rod rode role roll rolls
romp rot rote round route rove rover row rowed rub ruin rule ruler rung runs
rush rust

sack sad safe saga sage said sail sake sale salt same sane sang sank sap sat
sash save saved saw say says scan scar scare scene scent scone scoop
scoot score scout seam seat see seed seek seem seen sees self sell send
sense sent serve set sets settle seven sew sewn shade shady shake shall shape
share shave shed sheet shelf shift shin shiny shirt shone shook shop short shot shout show shown shut sick side sigh sight sign silk sill silly
since sip sir site sits size skid skim skin skit sky slab slam sled slept
slew slice slid slim slip slit slop slope slot slow slug slump small
smart smell smog snap snip snore snort snout snug soak soar sob sock soda
sofa soil sold sole solo some son soon soot sore sort sound sour south sow sown
space spade span spark speak speed spell spend spent spill spit splat spoke
sport sprout spun stack staff stage stain stair stake stale stand stare start
state stay stays steel steer stern stick still sting stink stood stool
store stork stove straw stray strip stuck study stuff stump stun sty such suit
sum sun sung sunk sunny super sure swam swap sway sweep sweet swept swift

tack tact tag take taken takes tale talk tall tame tan tap taps tar tarp tart
task taste tastes tea teach teams tease tee teen tell tells ten tend tends tens
term test than thank that thaw the their them then there these they thick thin
this those three threw throw thud thumb tick tidy tied tier ties tight tile
till tilt tin tine tint tip tire tired title toad today toe told toll tone tones
tongs too took tool tools top tore torn toss tot total tote touch tour toward
towel toy trace track trail trait tray tread trend trial tribe trick tried
trim trio trot true trunk trust truth try tug tune tusk twin twins twist type

under undo unit unite unity until unto upon upset urge use used useful
uses usual

vain vale van vast veil vent verb very vine visit voice vote vow vowel

wad wag wage wail waist wait waits wake walk wand want wants ward
ware warn was wasp watch wave waved waves wavy way ways weak wear wears weave
wed wee week weep weigh went were west wet what wheat when where which while
whim whip whir white who whole why wide wield wife wild will wilt wilt win wink wipe wire wiry wish wit with woke wolf wok won woo wore worn worse
worst wove wow wren write wrong wrote

yap yard yarn yawn yell yelp yen yes yet yew yip you young your yours yum

zany zap zest zinc zing zip zoo zoom

bar man men she ark ego peg spa mid ode pro ache aloe alto amen arid atop
balm bask cask char cite cost dale dame dean drew earl etch gape jack kale
lisp lode mart mead mesa mire nape opal peso perk rage rasp rein rite roe
slat snag spar spat stag stow talc tamp taro teak tern tram toil
adopt agent alert amber anger aspen asset aster bleak blame bleat chart
cleat delta depot erect grade inert irate organ panel pager saint satin
sitar slant smear snare sonar spoil split steak strap strew swore tamer
taper tapir trash think lapse laser media admire anklet antler castor
create danger gander heater learnt parent pastel pastor pirate ramble
ranged reason repaint retain stable staple strain tanner tassel wreath
sarong beats cases casts gears gnats hares lasts means panes planes plots
poets rains ranges tapes tarps tows twos terms pleats salts pelts oils tins
mares peals reaps reams realms rants elks elms eras fates feats laces larks
nags ores pales pares tames tans teals totes groans
`;
