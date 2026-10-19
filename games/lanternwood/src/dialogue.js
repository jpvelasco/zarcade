// Every conversation in Lanternwood. `scriptFor(npc, view)` returns a script
// for the current progress: { start, nodes: { id: node } } where a node is
//   { who, text, next?, choices?: [{ label, next?, fail?, effects? }], effects? }
// Effects are strings the game carries out (see Game.runEffect):
//   'event:<quest event>', 'buy:<item>:<price>', 'heal', 'race:start',
//   'flag:<name>', 'ending'. `view` is a read-only snapshot of progress.

export const NAMES = {
  wren: 'Wren', tumble: 'Tumble', wick: 'Grandma Wick', mira: 'Mira', bun: 'Bun',
  hazel: 'Hazel', gill: 'Gill', owl: 'Hoo', pell: 'Pell', sage: 'Sage Moss',
  rowan: 'Rowan', biscuit: 'Biscuit', shade: 'The Shade King', sign: 'Sign',
};

// Build a straight run of nodes; the last one gets `last` merged in.
function seq(prefix, lines, last = {}) {
  const nodes = {};
  lines.forEach(([who, text], i) => {
    nodes[`${prefix}${i}`] = { who, text, next: i < lines.length - 1 ? `${prefix}${i + 1}` : null };
  });
  Object.assign(nodes[`${prefix}${lines.length - 1}`], last);
  return nodes;
}
const script = (nodes, start = 'a0') => ({ start, nodes });

const MAIN_HINTS = [
  'Grandma Wick is waiting by the Great Lantern in Lantern Plaza.',
  'Mossy Burrow is west of Lantern Plaza, in Mosswood Hollow. I can smell the moss from here!',
  'The drawbridge east of Market Row is stuck. If only we could throw something at its switch... like your leafarang!',
  'The chasm north of Lantern Plaza has posts on both sides. Vine seeds could zip you across!',
  'All three shards! Hurry back to Grandma Wick at the Great Lantern!',
  'Everything glows. Want to look for secrets? I bet there are lamp posts and treasure still waiting.',
];

export function scriptFor(npc, v) {
  const f = SCRIPTS[npc];
  if (!f) return script({ a0: { who: 'sign', text: '...', next: null } });
  return f(v);
}

export function signScript(text) {
  return script({ a0: { who: 'sign', text, next: null } });
}

export function hintScript(v) {
  const stage = Math.max(0, Math.min(MAIN_HINTS.length - 1, v.stage('main')));
  let text = MAIN_HINTS[stage];
  if (v.dark && !v.has('dash')) text = 'It is dark in here. Your lantern lights the way, and lit torches light even more!';
  return script({ a0: { who: 'tumble', text: `*sniff sniff* ${text}`, next: null } });
}

const SCRIPTS = {
  wick(v) {
    const m = v.stage('main');
    const lamps = v.stage('lamps');
    if (m === 0) {
      return script({
        ...seq('a', [
          ['wick', 'Wren! Oh, thank the stars you are here.'],
          ['wick', 'The Great Lantern went out last night. Without its glow, Lanternwood will fall into a night that never ends.'],
          ['wick', 'The Shade King snuffed it, and he scattered its three Flame Shards into three old dungeons!'],
          ['wren', 'The Shade King? The shadow from the bedtime stories?'],
          ['wick', 'The very same. You are a real lamplighter now. Take your lantern, and Grandpa\'s old sword.'],
          ['wick', 'The first shard is hiding in Mossy Burrow, west through Mosswood Hollow. Tumble will sniff out the way.'],
        ], { effects: ['event:talk:wick'], next: 'l0' }),
        ...lampOffer(),
      });
    }
    if (lamps === 1) {
      return script(seq('a', [
        ['wick', 'All five lamp posts, glowing like little suns! You make an old lamplighter proud.'],
        ['wick', 'Here, a heart container. It was mine when I was your age.'],
      ], { effects: ['event:talk:wick'] }));
    }
    if (m === 4) {
      return script({
        a0: { who: 'wick', text: 'Wren... is that warm glow in your satchel... all three Flame Shards?', next: 'a1' },
        a1: {
          who: 'wick', text: 'Then it is time. Shall we light the Great Lantern together?',
          choices: [
            { label: 'Light the Great Lantern!', next: 'a2', effects: ['event:lantern:lit'] },
            { label: 'Not yet', next: null },
          ],
        },
        a2: { who: 'wick', text: 'Ohh... look at it shine! Lanternwood is glowing again!', next: null, effects: ['ending'] },
      });
    }
    if (m >= 5) {
      return script(seq('a', [
        ['wick', 'Every window in the village is glowing. And look who came to the festival!'],
        ['wick', 'The Shade King says the light tickles. I think he is just happy.'],
      ]));
    }
    if (lamps < 0) {
      return script({ a0: { who: 'wick', text: MAIN_WICK[m] || MAIN_WICK[1], next: 'l0' }, ...lampOffer() });
    }
    return script({ a0: { who: 'wick', text: MAIN_WICK[m] || MAIN_WICK[1], next: null } });
  },

  mira(v) {
    const c = v.stage('cat');
    if (c === 1) {
      return script(seq('a', [
        ['mira', 'BISCUIT! You found her! Oh, you silly fluffball.'],
        ['biscuit', 'Mrrrrp!'],
        ['mira', 'Thank you, Wren. Please take this heart container. Biscuit wants you to have it.'],
      ], { effects: ['event:talk:mira'] }));
    }
    if (c === 2) return script({ a0: { who: 'mira', text: 'Biscuit keeps bringing me leaves. I think it means thank you!', next: null } });
    if (c === 0) return script({ a0: { who: 'mira', text: 'Please find Biscuit! She loves quiet, mossy places up north.', next: null } });
    return script({
      a0: { who: 'mira', text: 'Wren, have you seen my cat Biscuit? Orange, fluffy, with a white tip on her tail.', next: 'a1' },
      a1: {
        who: 'mira', text: 'She ran off when the Lantern went out. Could you look for her?',
        choices: [
          { label: 'I will find her!', next: 'a2', effects: ['event:accept:cat'] },
          { label: 'Not right now', next: 'a3' },
        ],
      },
      a2: { who: 'mira', text: 'Thank you! She loves quiet, mossy places up north.', next: null },
      a3: { who: 'mira', text: 'Okay... if you see an orange fluffball, tell her I miss her.', next: null },
    });
  },

  biscuit(v) {
    if (v.flag('cat:found')) return script({ a0: { who: 'biscuit', text: 'Purrrr.', next: null } });
    return script(seq('a', [
      ['biscuit', 'Mrrrp?'],
      ['wren', 'Biscuit! Mira is so worried. Want a ride home?'],
      ['biscuit', 'Mrrrrrp! (Biscuit hops into your satchel and starts purring.)'],
    ], { effects: ['flag:cat:found', 'event:found:cat'] }));
  },

  bun(v) {
    const h = v.stage('honey');
    if (h === 1) {
      return script(seq('a', [
        ['bun', 'Three perfect honeycaps! They smell like sunshine.'],
        ['bun', 'Here, have some glowberries and a bottle of Fairy Tea. If you ever run out of hearts, it will perk you right up!'],
      ], { effects: ['event:talk:bun'] }));
    }
    if (h === 2) return script({ a0: { who: 'bun', text: 'The pie is cooling on the windowsill. No peeking, Biscuit!', next: null } });
    if (h === 0) return script({ a0: { who: 'bun', text: `Honeycaps glow gold and grow in the woods and hills. You have ${Math.min(3, v.count('honey'))} of 3.`, next: null } });
    return script({
      a0: { who: 'bun', text: 'Hiya, Wren! I am baking a Honeycap Pie for when the Lantern is lit again.', next: 'a1' },
      a1: {
        who: 'bun', text: 'But I am all out of honeycaps! Could you find me three?',
        choices: [
          { label: 'Leave it to me!', next: 'a2', effects: ['event:accept:honey'] },
          { label: 'Maybe later', next: null },
        ],
      },
      a2: { who: 'bun', text: 'Yay! They glow gold. Look in the woods and up in the hills.', next: null },
    });
  },

  hazel(v) {
    const r = v.stage('race');
    if (r >= 1) return script({ a0: { who: 'hazel', text: 'A rematch? Nope. My legs are noodles. You win, lamplighter!', next: null } });
    return script({
      a0: { who: 'hazel', text: 'I am Hazel, the fastest ears in Lanternwood! Bet you cannot beat me to the flag in Mosswood North.', next: 'a1' },
      a1: {
        who: 'hazel', text: `You get ${v.raceTime} seconds. Ready?`,
        choices: [
          { label: 'Ready, set, go!', next: null, effects: ['event:accept:race', 'race:start'] },
          { label: 'Not now', next: 'a2' },
        ],
      },
      a2: { who: 'hazel', text: 'Scared of a bunny? Ha! I will be here.', next: null },
    });
  },

  gill(v) {
    const fq = v.stage('fish');
    if (fq === 1) {
      return script(seq('a', [
        ['gill', 'Three fish! And look at the size of that one. You are a natural.'],
        ['gill', 'Take this heart container. I found it in a very surprised fish.'],
      ], { effects: ['event:talk:gill'] }));
    }
    if (fq === 2) return script({ a0: { who: 'gill', text: 'The fish are always biting for you. Come back and cast any time.', next: null } });
    if (fq === 0) return script({ a0: { who: 'gill', text: `Stand at the end of the dock and press talk to cast. When the bobber dips, strike! Caught ${Math.min(3, v.count('fish'))} of 3.`, next: null } });
    return script({
      a0: { who: 'gill', text: 'Shh... the fish are sleepy. Ever been fishing, little lamplighter?', next: 'a1' },
      a1: {
        who: 'gill', text: 'Use my spare rod and catch me three fish?',
        choices: [
          { label: 'Sure!', next: 'a2', effects: ['event:accept:fish'] },
          { label: 'No thanks', next: null },
        ],
      },
      a2: { who: 'gill', text: 'Stand at the end of the dock and press talk to cast. When the bobber dips, strike!', next: null },
    });
  },

  owl(v) {
    if (v.stage('riddle') >= 1) return script({ a0: { who: 'owl', text: 'Hoo knows the answer? You do! Hoo hoo.', next: null } });
    return script({
      a0: { who: 'owl', text: 'Hoo! Hoo goes there? A lamplighter, all the way up here!', next: 'a1', effects: ['event:accept:riddle'] },
      a1: { who: 'owl', text: 'Answer my riddle and I will give you a treasure. Ready?', next: 'q' },
      q: {
        who: 'owl', text: 'I have a mouth but never eat. I have a bed but never sleep. I run all day but never walk. What am I?',
        choices: [
          { label: 'A sleepy bear', next: 'w1' },
          { label: 'A river', next: 'r0', effects: ['event:riddle:correct'] },
          { label: 'A cave', next: 'w2' },
        ],
      },
      w1: { who: 'owl', text: 'A bear eats plenty and sleeps all winter! Hoo-hoo. Try again.', next: 'q' },
      w2: { who: 'owl', text: 'Close, but caves do not run anywhere! Try again.', next: 'q' },
      r0: { who: 'owl', text: 'Hoo-RAY! A river! Here, this heart container fell into my nest years ago.', next: null },
    });
  },

  pell(v) {
    const choices = [{ label: 'Fairy Tea · 30', next: 'tea', fail: 'broke', effects: ['buy:tea:30'] }];
    if (!v.pouch) choices.push({ label: 'Big Berry Pouch · 50', next: 'pouch', fail: 'broke', effects: ['buy:pouch:50'] });
    choices.push({ label: 'Heart Snack · 10', next: 'snack', fail: 'broke', effects: ['buy:snack:10'] });
    choices.push({ label: 'Just looking', next: 'bye' });
    return script({
      a0: { who: 'pell', text: `Welcome to Pell's Pantry! You have ${v.berries} glowberries. What will it be?`, choices },
      tea: { who: 'pell', text: 'One Fairy Tea! If your hearts run out, it brings you right back. You can carry one at a time.', next: null },
      pouch: { who: 'pell', text: 'A big pouch! Now you can carry 300 glowberries.', next: null },
      snack: { who: 'pell', text: 'A crunchy heart snack. Mmm, you look better already!', next: null },
      broke: { who: 'pell', text: 'Oh dear, that is not quite enough glowberries, or your bag is already full. Cut some grass, maybe?', next: null },
      bye: { who: 'pell', text: 'Come back soon!', next: null },
    });
  },

  sage() {
    return script(seq('a', [
      ['sage', 'Sit, sit. Rest a moment, little lamplighter.'],
      ['sage', 'There. All your hearts are full again. Mind the beetles!'],
    ], { effects: ['heal'] }));
  },

  rowan(v) {
    const m = v.stage('main');
    const lines = [
      'Grandma Wick is looking for you! She is by the big lantern.',
      'I saw slimes bouncing near Mossy Burrow. Bounce bounce!',
      'Did you know the drawbridge switch only needs one good bonk?',
      'My dad says the posts by the chasm are for swinging. I am too little.',
      'You have all the shards? Go go go!',
      'Best. Festival. Ever!',
    ];
    return script({ a0: { who: 'rowan', text: lines[Math.max(0, Math.min(lines.length - 1, m))], next: null } });
  },

  shade() {
    return script(seq('a', [
      ['shade', 'W-wait! Please do not snuff me out!'],
      ['shade', 'I only wanted a night that never ends. In the dark, nobody can see that I am all alone.'],
      ['wren', 'You do not have to be alone. Come to the Lantern Festival! Everyone is welcome.'],
      ['shade', '...Even a shadow?'],
      ['wren', 'Especially a shadow. You can not have shadows without light!'],
      ['shade', 'Then take this. The last Flame Shard. It feels warm... like a friend.'],
    ], { effects: ['event:shard:peak'] }));
  },

  shadefriend() {
    return script({ a0: { who: 'shade', text: 'The lantern light does not hurt at all. It tickles! Hee hee.', next: null } });
  },
};

const MAIN_WICK = [
  '',
  'Mossy Burrow is west through Mosswood Hollow. Be brave, and be kind!',
  'The second shard sank with the Sunken Bell Temple, out on Lake Shimmer. The drawbridge switch is on the far bank.',
  'The last shard is up at Clockwork Peak. The chasm north of here has old vine posts.',
];

function lampOffer() {
  return {
    l0: {
      who: 'wick', text: 'Oh, and the five old lamp posts around Lanternwood went dark too. Would you light them with your lantern?',
      choices: [
        { label: 'Yes, Grandma!', next: 'l1', effects: ['event:accept:lamps'] },
        { label: 'Maybe later', next: 'l2' },
      ],
    },
    l1: { who: 'wick', text: 'Wonderful. Press your item button with the lantern to toss a little flame. Or just walk up and give it a touch.', next: null },
    l2: { who: 'wick', text: 'Come back any time, dear.', next: null },
  };
}

/**
 * The choice highlighted when a choice appears. Shops start on the free
 * option, so mashing through a greeting never spends berries.
 */
export function defaultChoice(node) {
  const list = node?.choices || [];
  const free = list.findIndex((c) => !(c.effects || []).some((e) => e.startsWith('buy:')));
  return free > 0 && list.some((c) => (c.effects || []).some((e) => e.startsWith('buy:'))) ? free : 0;
}

/** Every node id a script can reach must exist; used by tests. */
export function brokenLinks(s) {
  const bad = [];
  if (!s.nodes[s.start]) bad.push(s.start);
  for (const [id, n] of Object.entries(s.nodes)) {
    if (n.next && !s.nodes[n.next]) bad.push(`${id}->${n.next}`);
    for (const c of n.choices || []) {
      if (c.next && !s.nodes[c.next]) bad.push(`${id}->${c.next}`);
      if (c.fail && !s.nodes[c.fail]) bad.push(`${id}->${c.fail}`);
    }
  }
  return bad;
}

export const NPC_IDS = Object.keys(SCRIPTS);
