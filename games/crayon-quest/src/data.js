// All game content: cards, monsters, encounters, stickers, heroes, events.
// DOM-free. Numbers were tuned with the playtest bot (tests/bot.test.js).

// ------------------------------------------------------------ cards
//
// fx keys: dmg, hits, aoe, block, draw, energy, heal, power, smudge, soggy,
// dizzy (single target unless the name ends in All), special, magic.
// `up` overrides fields (including cost) for the upgraded "colored in" card.

const C = (id, name, kind, cost, rarity, icon, fx, up, extra = {}) => ({
  id, name, kind, cost, rarity, icon, fx, up, hero: null, poof: false, ...extra,
});

export const CARDS = [
  // starters
  C('scribble', 'Scribble', 'attack', 1, 'starter', 'slash', { dmg: 6 }, { dmg: 9 }),
  C('doodle_shield', 'Doodle Shield', 'skill', 1, 'starter', 'shield', { block: 5 }, { block: 8 }),
  C('big_swirl', 'Big Swirl', 'attack', 2, 'starter', 'swirl', { dmg: 9, soggy: 2 }, { dmg: 12, soggy: 3 }, { hero: 'kid' }),
  C('cardboard_bash', 'Cardboard Bash', 'attack', 2, 'starter', 'box', { dmg: 8, block: 6 }, { dmg: 11, block: 8 }, { hero: 'knight' }),
  C('paint_splat', 'Paint Splat', 'skill', 1, 'starter', 'drop', { smudge: 5 }, { smudge: 7 }, { hero: 'wizard' }),
  C('eraser_dash', 'Eraser Dash', 'attack', 0, 'starter', 'eraser', { dmg: 2, draw: 1 }, { dmg: 4, draw: 1 }, { hero: 'ninja' }),

  // common
  C('zigzag', 'Zig-Zag', 'attack', 1, 'common', 'zigzag', { dmg: 4, hits: 2 }, { dmg: 5, hits: 2 }),
  C('crayon_toss', 'Crayon Toss', 'attack', 0, 'common', 'crayon', { dmg: 3 }, { dmg: 5 }),
  C('rainbow_wave', 'Rainbow Wave', 'attack', 1, 'common', 'rainbow', { dmg: 5, aoe: true }, { dmg: 7, aoe: true }),
  C('smudge_poke', 'Smudge Poke', 'attack', 1, 'common', 'poke', { dmg: 4, smudge: 3 }, { dmg: 5, smudge: 4 }),
  C('doodle_dash', 'Doodle Dash', 'attack', 1, 'common', 'dash', { dmg: 6, draw: 1 }, { dmg: 8, draw: 1 }),
  C('heavy_marker', 'Heavy Marker', 'attack', 2, 'common', 'marker', { dmg: 14 }, { dmg: 18 }),
  C('dot_dot_dot', 'Dot Dot Dot', 'attack', 1, 'common', 'dots', { dmg: 2, hits: 3 }, { dmg: 3, hits: 3 }),
  C('paper_plane', 'Paper Plane', 'attack', 1, 'common', 'plane', { dmg: 8 }, { dmg: 11 }),
  C('cardboard_wall', 'Cardboard Wall', 'skill', 2, 'common', 'wall', { block: 13 }, { block: 17 }),
  C('quick_sketch', 'Quick Sketch', 'skill', 1, 'common', 'pencil', { block: 5, draw: 1 }, { block: 7, draw: 1 }),
  C('water_spill', 'Water Spill', 'skill', 1, 'common', 'splash', { soggyAll: 2 }, { soggyAll: 3 }),
  C('tickle_feather', 'Tickle Feather', 'skill', 0, 'common', 'feather', { dizzy: 1 }, { dizzy: 2 }),
  C('snack_time', 'Snack Time', 'skill', 1, 'common', 'apple', { heal: 5 }, { heal: 8 }, { poof: true }),
  C('juice_box', 'Juice Box', 'skill', 0, 'common', 'juice', { energy: 1 }, { energy: 1, draw: 1 }, { poof: true }),

  // uncommon
  C('color_storm', 'Color Storm', 'attack', 2, 'uncommon', 'storm', { dmg: 9, aoe: true }, { dmg: 12, aoe: true }),
  C('shield_bash', 'Shield Bash', 'attack', 1, 'uncommon', 'bash', { special: 'shieldHit' }, { cost: 0 }),
  C('big_idea', 'Big Idea', 'skill', 1, 'uncommon', 'bulb', { draw: 3 }, { cost: 0 }),
  C('sharpener', 'Sharpener', 'magic', 1, 'uncommon', 'sharpener', { power: 2 }, { power: 3 }),
  C('crayon_armor', 'Crayon Armor', 'magic', 1, 'uncommon', 'armor', { magic: { armor: 3 } }, { magic: { armor: 5 } }),
  C('bubble_wrap', 'Bubble Wrap', 'skill', 1, 'uncommon', 'bubble', { block: 8 }, { block: 11 }),
  C('doodle_stomp', 'Doodle Stomp', 'attack', 2, 'uncommon', 'boot', { dmg: 11, dizzy: 2 }, { dmg: 14, dizzy: 2 }),
  C('sticky_glue', 'Sticky Glue', 'skill', 1, 'uncommon', 'glue', { dizzy: 2, soggy: 2 }, { dizzy: 3, soggy: 3 }),
  C('scribble_frenzy', 'Scribble Frenzy', 'attack', 2, 'uncommon', 'frenzy', { dmg: 3, hits: 4 }, { dmg: 4, hits: 4 }),
  C('deep_breath', 'Deep Breath', 'skill', 1, 'uncommon', 'breath', { draw: 2, block: 3 }, { draw: 2, block: 6 }),
  C('glitter_bomb', 'Glitter Bomb', 'attack', 1, 'uncommon', 'glitter', { dmg: 7, aoe: true }, { dmg: 10, aoe: true }, { poof: true }),
  C('big_hug', 'Big Hug', 'skill', 2, 'uncommon', 'heart', { heal: 6, block: 6 }, { heal: 9, block: 9 }, { poof: true }),

  // rare
  C('giant_stamp', 'Giant Stamp', 'attack', 3, 'rare', 'stamp', { dmg: 26 }, { dmg: 34 }),
  C('masterpiece', 'Masterpiece', 'magic', 2, 'rare', 'palette', { magic: { glitter: 3 } }, { magic: { glitter: 5 } }),
  C('thinking_cap', 'Thinking Cap', 'magic', 2, 'rare', 'cap', { magic: { quick: 1 } }, { cost: 1 }),
  C('super_crayon', 'Super Crayon', 'magic', 3, 'rare', 'super', { magic: { spark: 1 } }, { cost: 2 }),
  C('pillow_fort', 'Pillow Fort', 'skill', 2, 'rare', 'pillow', { block: 18 }, { block: 24 }),
  C('doodle_buddy', 'Doodle Buddy', 'magic', 2, 'rare', 'buddy', { magic: { shadow: 2 } }, { magic: { shadow: 3 } }),

  // hero signatures
  C('gold_star', 'Gold Star', 'attack', 1, 'uncommon', 'star', { dmg: 6, power: 1 }, { dmg: 8, power: 1 }, { hero: 'kid' }),
  C('imagination', 'Imagination', 'skill', 1, 'rare', 'sparkle', { draw: 2, energy: 1 }, { draw: 3, energy: 1 }, { hero: 'kid' }),
  C('crayon_hero', 'Crayon Hero', 'attack', 1, 'common', 'cape', { dmg: 5, block: 4 }, { dmg: 7, block: 6 }, { hero: 'kid' }),
  C('helmet_bonk', 'Helmet Bonk', 'attack', 1, 'common', 'helmet', { dmg: 5, block: 5 }, { dmg: 7, block: 7 }, { hero: 'knight' }),
  C('fortress', 'Fortress', 'skill', 1, 'uncommon', 'castle', { special: 'doubleShield' }, { cost: 0 }, { hero: 'knight' }),
  C('brave_banner', 'Brave Banner', 'magic', 2, 'rare', 'flag', { magic: { grow: 1 } }, { cost: 1 }, { hero: 'knight' }),
  C('splash_zone', 'Splash Zone', 'skill', 2, 'common', 'splash', { smudgeAll: 4 }, { smudgeAll: 6 }, { hero: 'wizard' }),
  C('double_drip', 'Double Drip', 'skill', 1, 'uncommon', 'drops', { special: 'doubleSmudge' }, { cost: 0 }, { hero: 'wizard' }),
  C('magic_marker', 'Magic Marker', 'magic', 2, 'rare', 'wand', { magic: { drip: 2 } }, { magic: { drip: 3 } }, { hero: 'wizard' }),
  C('paper_stars', 'Paper Stars', 'attack', 1, 'common', 'shuriken', { dmg: 2, hits: 4 }, { dmg: 3, hits: 4 }, { hero: 'ninja' }),
  C('sneaky_step', 'Sneaky Step', 'skill', 0, 'common', 'shoe', { block: 3, draw: 1 }, { block: 5, draw: 1 }, { hero: 'ninja' }),
  C('flurry', 'Flurry', 'attack', 1, 'rare', 'flurry', { special: 'flurry', dmg: 3 }, { special: 'flurry', dmg: 4 }, { hero: 'ninja' }),
];

export const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c]));

// The effective definition of a card instance ({ id, up }).
export function cardDef(inst) {
  const base = CARD[inst.id];
  if (!inst.up) return base;
  const up = base.up || {};
  const { cost, ...fxUp } = up;
  return {
    ...base,
    name: `${base.name}+`,
    cost: cost ?? base.cost,
    fx: { ...base.fx, ...fxUp },
  };
}

// A card needs a chosen monster when it hits or tricks just one of them.
export function needsTarget(def) {
  const fx = def.fx;
  if (fx.special === 'shieldHit' || fx.special === 'flurry' || fx.special === 'doubleSmudge') return true;
  if (fx.dmg && !fx.aoe) return true;
  return !!(fx.smudge || fx.soggy || fx.dizzy);
}

// Short, kid-friendly lines for the face of a card.
// `hit` formats a damage number (the page uses it to show Power and Dizzy).
export function cardLines(def, hit = (n) => String(n)) {
  const fx = def.fx;
  const lines = [];
  if (fx.special === 'shieldHit') lines.push('Hit = your Shield');
  if (fx.special === 'doubleSmudge') lines.push('Double its Smudge');
  if (fx.special === 'doubleShield') lines.push('Double your Shield');
  if (fx.special === 'flurry') lines.push(`Hit ${hit(fx.dmg)} for each card played this turn`);
  else if (fx.dmg) {
    let t = `Hit ${hit(fx.dmg)}`;
    if (fx.hits > 1) t += ` ×${fx.hits}`;
    if (fx.aoe) t += ' to all';
    lines.push(t);
  }
  if (fx.block) lines.push(`Shield ${fx.block}`);
  if (fx.smudge) lines.push(`Smudge ${fx.smudge}`);
  if (fx.smudgeAll) lines.push(`Smudge ${fx.smudgeAll} to all`);
  if (fx.soggy) lines.push(`Soggy ${fx.soggy}`);
  if (fx.soggyAll) lines.push(`Soggy ${fx.soggyAll} to all`);
  if (fx.dizzy) lines.push(`Dizzy ${fx.dizzy}`);
  if (fx.power) lines.push(`+${fx.power} Power`);
  if (fx.heal) lines.push(`Heal ${fx.heal}`);
  if (fx.draw) lines.push(`Draw ${fx.draw}`);
  if (fx.energy) lines.push(`+${fx.energy} Energy`);
  const m = fx.magic;
  if (m) {
    if (m.armor) lines.push(`End of turn: Shield ${m.armor}`);
    if (m.glitter) lines.push(`End of turn: Hit ${m.glitter} to all`);
    if (m.quick) lines.push(`Draw ${m.quick} more each turn`);
    if (m.spark) lines.push(`+${m.spark} Energy each turn`);
    if (m.shadow) lines.push(`Each card you play: Shield ${m.shadow}`);
    if (m.grow) lines.push(`Each turn: +${m.grow} Power`);
    if (m.drip) lines.push(`Each turn: Smudge ${m.drip} to all`);
  }
  if (def.kind === 'magic') lines.push('Stays all battle');
  if (def.poof) lines.push('Poof!');
  return lines;
}

// ------------------------------------------------------------ statuses

export const STATUS_INFO = {
  block: { name: 'Shield', icon: 'shield', text: 'Soaks up damage. Goes away at the start of the next turn.' },
  power: { name: 'Power', icon: 'muscle', text: '+1 damage on every hit for each point.' },
  smudge: { name: 'Smudge', icon: 'drop', text: 'Loses this much HP each turn, then it goes down by 1.' },
  soggy: { name: 'Soggy', icon: 'splash', text: 'Soggy paper tears easily: takes 50% more damage.' },
  dizzy: { name: 'Dizzy', icon: 'dizzy', text: 'Too dizzy to aim: hits 25% softer.' },
};

// ------------------------------------------------------------ monsters
//
// moves: t = atk (dmg, hits), def (block), buff (power, block), debuff
// (soggy/dizzy/smudge on the hero), atkdef (dmg + block), atkdebuff,
// summon (id), heal. pattern 'cycle' repeats moves in order; 'random' picks
// by weight w and never repeats a move three times in a row.

const M = (id, name, floor, role, hp, pattern, moves, art) => ({ id, name, floor, role, hp, pattern, moves, art });

export const MONSTERS = [
  // Page 1: Pencil Woods
  M('blob', 'Scribble Blob', 0, 'normal', [11, 14], 'random', [
    { t: 'atk', dmg: 6, w: 3 }, { t: 'atkdef', dmg: 3, block: 4, w: 2 }, { t: 'buff', power: 2, w: 1 },
  ], { body: 'blob', color: '#7c5cff', eyes: 2, mouth: 'grin', extras: ['scribbles'] }),
  M('eraser', 'Grumpy Eraser', 0, 'normal', [17, 20], 'cycle', [
    { t: 'atk', dmg: 8 }, { t: 'atkdebuff', dmg: 4, dizzy: 1 }, { t: 'def', block: 6 },
  ], { body: 'rect', color: '#ff8fb1', eyes: 2, mouth: 'frown', extras: ['brows', 'legs'] }),
  M('snake', 'Paperclip Snake', 0, 'normal', [13, 16], 'random', [
    { t: 'atk', dmg: 3, hits: 2, w: 2 }, { t: 'atkdebuff', dmg: 4, soggy: 1, w: 2 },
  ], { body: 'snake', color: '#9aa7b8', eyes: 2, mouth: 'tongue', extras: [] }),
  M('bat', 'Ink Bat', 0, 'normal', [8, 10], 'random', [
    { t: 'atk', dmg: 4, w: 2 }, { t: 'atk', dmg: 2, hits: 2, w: 2 },
  ], { body: 'circle', color: '#3b3f6b', eyes: 2, mouth: 'fangs', extras: ['wings'], scale: 0.75 }),
  M('paperball', 'Crumple Ball', 0, 'normal', [20, 23], 'cycle', [
    { t: 'def', block: 7 }, { t: 'atk', dmg: 9 }, { t: 'atk', dmg: 6 },
  ], { body: 'ball', color: '#e8e2cf', eyes: 2, mouth: 'o', extras: ['creases'] }),
  M('stapler', 'Stapler Beast', 0, 'elite', [44, 48], 'cycle', [
    { t: 'atk', dmg: 5, hits: 2 }, { t: 'buff', power: 2, block: 6 }, { t: 'atk', dmg: 13 }, { t: 'atkdebuff', dmg: 6, soggy: 2 },
  ], { body: 'rect', color: '#e2483d', eyes: 1, mouth: 'teeth', extras: ['legs', 'spikes'], scale: 1.15 }),
  M('king_scribble', 'King Scribble', 0, 'boss', [84, 84], 'cycle', [
    { t: 'summon', id: 'blob', block: 8 }, { t: 'atk', dmg: 7, hits: 2 }, { t: 'buff', power: 2, block: 10 }, { t: 'atk', dmg: 16 }, { t: 'atkdebuff', dmg: 8, dizzy: 2 },
  ], { body: 'blob', color: '#5b3cf0', eyes: 2, mouth: 'grin', extras: ['crown', 'scribbles', 'arms'], scale: 1.35 }),

  // Page 2: Marker Marsh
  M('glue_goblin', 'Glue Goblin', 1, 'normal', [26, 30], 'random', [
    { t: 'atkdebuff', dmg: 6, dizzy: 1, w: 2 }, { t: 'atk', dmg: 11, w: 2 },
  ], { body: 'tri', color: '#9be15d', eyes: 2, mouth: 'grin', extras: ['ears', 'drips'] }),
  M('marker_mole', 'Marker Mole', 1, 'normal', [30, 34], 'random', [
    { t: 'def', block: 10, w: 1 }, { t: 'atk', dmg: 13, w: 2 }, { t: 'atkdef', dmg: 7, block: 6, w: 1 },
  ], { body: 'circle', color: '#a0704a', eyes: 2, mouth: 'teeth', extras: ['nose', 'arms'] }),
  M('tape_turtle', 'Tape Turtle', 1, 'normal', [34, 38], 'cycle', [
    { t: 'def', block: 12 }, { t: 'atkdef', dmg: 8, block: 6 }, { t: 'atk', dmg: 12 },
  ], { body: 'dome', color: '#4fc3c8', eyes: 2, mouth: 'grin', extras: ['legs', 'shell'] }),
  M('crayon_crab', 'Crayon Crab', 1, 'normal', [24, 28], 'random', [
    { t: 'atk', dmg: 5, hits: 2, w: 3 }, { t: 'buff', power: 2, block: 5, w: 1 },
  ], { body: 'crab', color: '#ff7043', eyes: 2, mouth: 'grin', extras: ['claws', 'legs'] }),
  M('paint_puddle', 'Paint Puddle', 1, 'normal', [20, 24], 'cycle', [
    { t: 'debuff', smudge: 3 }, { t: 'atk', dmg: 8 }, { t: 'atk', dmg: 6 },
  ], { body: 'puddle', color: '#ec5fd8', eyes: 2, mouth: 'o', extras: ['drips'] }),
  M('hydra', 'Highlighter Hydra', 1, 'elite', [78, 84], 'cycle', [
    { t: 'atk', dmg: 6, hits: 3 }, { t: 'buff', power: 2, block: 12 }, { t: 'atkdebuff', dmg: 11, soggy: 2 }, { t: 'atk', dmg: 16 },
  ], { body: 'hydra', color: '#f4e04d', eyes: 2, mouth: 'grin', extras: ['heads'], scale: 1.2 }),
  M('inky', 'Inky the Blot', 1, 'boss', [110, 110], 'cycle', [
    { t: 'debuff', smudge: 3, dizzy: 1 }, { t: 'atk', dmg: 9, hits: 2 }, { t: 'summon', id: 'paint_puddle', block: 10 }, { t: 'atk', dmg: 20 }, { t: 'buff', power: 2, block: 12 },
  ], { body: 'puddle', color: '#1f2a6b', eyes: 3, mouth: 'teeth', extras: ['drips', 'arms'], scale: 1.4 }),

  // Page 3: Rainbow Roof
  M('scissor_bird', 'Scissor Bird', 2, 'normal', [36, 40], 'random', [
    { t: 'atk', dmg: 5, hits: 3, w: 2 }, { t: 'atk', dmg: 15, w: 2 },
  ], { body: 'bird', color: '#3d8bfd', eyes: 1, mouth: 'beak', extras: ['wings'] }),
  M('origami_dragon', 'Origami Dragon', 2, 'normal', [46, 52], 'cycle', [
    { t: 'buff', power: 3, block: 6 }, { t: 'atk', dmg: 15 }, { t: 'atkdef', dmg: 10, block: 10 },
  ], { body: 'tri', color: '#e53958', eyes: 2, mouth: 'fangs', extras: ['horns', 'tail', 'wings'] }),
  M('glitter_ghost', 'Glitter Ghost', 2, 'normal', [32, 36], 'cycle', [
    { t: 'debuff', soggy: 2, dizzy: 2 }, { t: 'atk', dmg: 12 }, { t: 'atk', dmg: 9 },
  ], { body: 'ghost', color: '#d9c7ff', eyes: 2, mouth: 'o', extras: ['sparkles'] }),
  M('ruler_robot', 'Ruler Robot', 2, 'normal', [52, 58], 'cycle', [
    { t: 'def', block: 15 }, { t: 'atk', dmg: 20 }, { t: 'atkdef', dmg: 9, block: 9 },
  ], { body: 'robot', color: '#f2b233', eyes: 2, mouth: 'line', extras: ['antenna', 'arms', 'ticks'] }),
  M('sticky_note', 'Sticky Note', 2, 'normal', [28, 32], 'random', [
    { t: 'atk', dmg: 9, w: 2 }, { t: 'atkdef', dmg: 6, block: 6, w: 2 },
  ], { body: 'note', color: '#ffe45c', eyes: 2, mouth: 'grin', extras: ['fold'], scale: 0.85 }),
  M('shark', 'Sharpener Shark', 2, 'elite', [112, 120], 'cycle', [
    { t: 'atk', dmg: 9, hits: 2 }, { t: 'buff', power: 3, block: 12 }, { t: 'atk', dmg: 24 }, { t: 'atkdebuff', dmg: 8, soggy: 2 },
  ], { body: 'shark', color: '#7d8ea3', eyes: 1, mouth: 'teeth', extras: ['fin', 'tail'], scale: 1.2 }),
  M('grand_smudge', 'The Grand Smudge', 2, 'boss', [170, 170], 'cycle', [
    { t: 'buff', power: 2, block: 16 }, { t: 'atk', dmg: 10, hits: 2 }, { t: 'debuff', smudge: 5, soggy: 2 }, { t: 'atkdebuff', dmg: 11, dizzy: 2 }, { t: 'summon', id: 'sticky_note', block: 12 }, { t: 'atk', dmg: 25 },
  ], { body: 'cloud', color: '#2f2f3a', eyes: 2, mouth: 'teeth', extras: ['crown', 'arms', 'sparkles'], scale: 1.5 }),
];

export const MONSTER = Object.fromEntries(MONSTERS.map((m) => [m.id, m]));

// Normal encounters per page. The first two battles of a page use `easy`.
export const ENCOUNTERS = [
  {
    easy: [['blob'], ['snake'], ['bat', 'bat'], ['eraser']],
    hard: [['blob', 'blob'], ['eraser', 'bat'], ['paperball', 'snake'], ['bat', 'bat', 'bat'], ['paperball', 'blob'], ['snake', 'eraser']],
    elite: [['stapler']],
    boss: ['king_scribble'],
  },
  {
    easy: [['glue_goblin'], ['marker_mole'], ['crayon_crab'], ['paint_puddle', 'paint_puddle']],
    hard: [['tape_turtle', 'paint_puddle'], ['glue_goblin', 'crayon_crab'], ['marker_mole', 'paint_puddle'], ['crayon_crab', 'crayon_crab'], ['tape_turtle', 'glue_goblin']],
    elite: [['hydra']],
    boss: ['inky'],
  },
  {
    easy: [['scissor_bird'], ['origami_dragon'], ['sticky_note', 'sticky_note'], ['ruler_robot']],
    hard: [['glitter_ghost', 'scissor_bird'], ['ruler_robot', 'sticky_note'], ['origami_dragon', 'glitter_ghost'], ['sticky_note', 'sticky_note', 'glitter_ghost'], ['scissor_bird', 'sticky_note']],
    elite: [['shark']],
    boss: ['grand_smudge'],
  },
];

export const FLOORS = [
  { name: 'Pencil Woods', color: '#58a65c', paper: '#fbf6e6' },
  { name: 'Marker Marsh', color: '#2f9fb3', paper: '#f2f7ef' },
  { name: 'Rainbow Roof', color: '#d6559b', paper: '#fbf1f4' },
];

// ------------------------------------------------------------ stickers

const S = (id, name, rarity, icon, text, fx, color) => ({ id, name, rarity, icon, text, fx, color });

export const STICKERS = [
  S('smiley', 'Smiley Sticker', 'starter', 'smiley', 'Heal 6 after each battle.', { healAfter: 6 }, '#ffd23f'),
  S('helmet', 'Cardboard Helmet', 'starter', 'helmet', 'Start each battle with 7 Shield.', { startBlock: 7 }, '#c69c6d'),
  S('palette', 'Paint Palette', 'starter', 'palette', 'Start each battle: Smudge 3 to all monsters.', { startSmudgeAll: 3 }, '#b77cff'),
  S('sneakers', 'Swift Sneakers', 'starter', 'shoe', 'Draw 2 more cards on your first turn.', { firstDraw: 2 }, '#4fc3f7'),
  S('apple', 'Apple Sticker', 'common', 'apple', '+10 Max HP.', { maxHp: 10 }, '#ef5350'),
  S('rocket', 'Rocket Sticker', 'common', 'rocket', '+1 Energy on your first turn.', { firstEnergy: 1 }, '#ff8a65'),
  S('clover', 'Lucky Clover', 'common', 'clover', 'Pick from 4 cards instead of 3.', { choices: 1 }, '#66bb6a'),
  S('piggy', 'Piggy Bank', 'common', 'piggy', 'Get 50% more gold from battles.', { goldMult: 0.5 }, '#f48fb1'),
  S('thumbs_up', 'Thumbs Up', 'common', 'thumb', 'Start each battle with +1 Power.', { startPower: 1 }, '#ffca28'),
  S('cloud', 'Sleepy Cloud', 'common', 'cloud', 'Start each battle: Dizzy 1 to all monsters.', { startDizzyAll: 1 }, '#90caf9'),
  S('bubble', 'Bubble Sticker', 'common', 'bubble', 'Start each battle with 8 Shield.', { startBlock: 8 }, '#80deea'),
  S('banana', 'Banana Nap', 'common', 'banana', 'Naps heal 15% more.', { restBonus: 0.15 }, '#fff176'),
  S('cactus', 'Pokey Cactus', 'common', 'cactus', 'Monsters that hit you take 3 damage.', { thorns: 3 }, '#43a047'),
  S('sunflower', 'Sunflower', 'common', 'sunflower', 'Every 3rd turn: +1 Energy.', { everyThird: 1 }, '#fbc02d'),
  S('unicorn', 'Unicorn Sticker', 'boss', 'unicorn', '+1 Energy every turn.', { energy: 1 }, '#f06292'),
  S('owl', 'Wise Owl', 'boss', 'owl', 'Draw 1 more card every turn.', { draw: 1 }, '#8d6e63'),
  S('rainbow', 'Rainbow Sticker', 'boss', 'rainbow', 'Start each turn with 4 Shield.', { turnBlock: 4 }, '#7e57c2'),
  S('crown', 'Paper Crown', 'boss', 'crown', 'Start each battle with +2 Power.', { startPower: 2 }, '#ffb300'),
];

export const STICKER = Object.fromEntries(STICKERS.map((s) => [s.id, s]));

// ------------------------------------------------------------ heroes

export const HEROES = [
  {
    id: 'kid', name: 'Doodle Kid', hp: 70, color: '#ff6b35', sticker: 'smiley',
    blurb: 'A bit of everything. Scribbles, shields and a big swirl.',
    deck: [['scribble', 5], ['doodle_shield', 4], ['big_swirl', 1]],
    unlock: null, unlockText: '',
  },
  {
    id: 'knight', name: 'Sketchy Knight', hp: 78, color: '#3f7fd6', sticker: 'helmet',
    blurb: 'Cardboard armor and very big shields.',
    deck: [['scribble', 4], ['doodle_shield', 5], ['cardboard_bash', 1]],
    unlock: 'runs1', unlockText: 'Finish any run',
  },
  {
    id: 'wizard', name: 'Paint Wizard', hp: 68, color: '#8e5cf0', sticker: 'palette',
    blurb: 'Smudges monsters with drippy paint magic.',
    deck: [['scribble', 4], ['doodle_shield', 4], ['paint_splat', 2]],
    unlock: 'boss1', unlockText: 'Beat any boss',
  },
  {
    id: 'ninja', name: 'Eraser Ninja', hp: 60, color: '#2e2e3a', sticker: 'sneakers',
    blurb: 'Quick, cheap cards. Play lots of them in one turn.',
    deck: [['scribble', 4], ['doodle_shield', 4], ['eraser_dash', 2]],
    unlock: 'boss2', unlockText: 'Beat 2 bosses or win a run',
  },
];

export const HERO = Object.fromEntries(HEROES.map((h) => [h.id, h]));

// ------------------------------------------------------------ mystery pages
//
// Each option has an `effect` string handled by run.js. Every outcome is
// gentle: the worst is a few HP.

export const EVENTS = [
  {
    id: 'sharpener', title: 'The Humming Sharpener', art: 'sharpener',
    text: 'A friendly pencil sharpener hums a happy tune. "Want me to sharpen something?"',
    options: [
      { label: 'Color in a card', note: 'Upgrade a card', effect: 'upgrade' },
      { label: 'Ask for shavings', note: '+25 gold', effect: 'gold:25' },
    ],
  },
  {
    id: 'puddle', title: 'Rainbow Puddle', art: 'splash',
    text: 'A puddle of rainbow paint shimmers on the page. Something sparkly sits at the bottom!',
    options: [
      { label: 'Jump in!', note: 'Lose 6 HP, pick a rare card', effect: 'puddle' },
      { label: 'Hop around it', note: 'Nothing happens', effect: 'none' },
    ],
  },
  {
    id: 'lost_sticker', title: 'A Stuck Sticker', art: 'star',
    text: 'A shiny sticker is stuck to the corner of the page. It is really stuck on there.',
    options: [
      { label: 'Peel it off', note: 'Lose 5 HP, get a sticker', effect: 'sticker' },
      { label: 'Leave it, take a nap', note: 'Heal 10', effect: 'heal:10' },
    ],
  },
  {
    id: 'friend', title: 'A Shy Doodle', art: 'heart',
    text: 'A tiny shy doodle peeks out from behind a margin line. It wants to be your friend!',
    options: [
      { label: 'Draw it a hat', note: 'Heal 12', effect: 'heal:12' },
      { label: 'Trade a card', note: 'Erase a card from your deck', effect: 'remove' },
    ],
  },
  {
    id: 'vending', title: 'Crayon Machine', art: 'crayon',
    text: 'An old crayon vending machine rattles. A sign says: "30 gold for a surprise!"',
    options: [
      { label: 'Pay 30 gold', note: 'Get a random uncommon card', effect: 'vend', cost: 30 },
      { label: 'Give it a little shake', note: '+15 gold', effect: 'gold:15' },
    ],
  },
  {
    id: 'mirror', title: 'The Copy Mirror', art: 'sparkle',
    text: 'A magic mirror giggles. "Show me a card and I will draw you another one!"',
    options: [
      { label: 'Show a card', note: 'Copy a card in your deck', effect: 'copy' },
      { label: 'Wave hello', note: '+4 Max HP', effect: 'maxhp:4' },
    ],
  },
  {
    id: 'door', title: 'Draw a Door', art: 'pencil',
    text: 'You find a pencil that draws real things. What will you draw?',
    options: [
      { label: 'A treasure chest', note: '+40 gold', effect: 'gold:40' },
      { label: 'A comfy bed', note: 'Heal 15', effect: 'heal:15' },
    ],
  },
  {
    id: 'surprise', title: 'Surprise Doodle!', art: 'swirl',
    text: 'A doodle monster jumps out from the page! "Boo!" It wants a battle.',
    options: [
      { label: 'Battle!', note: 'Fight for a reward', effect: 'fight' },
      { label: 'Tiptoe away', note: 'Lose 3 HP', effect: 'hurt:3' },
    ],
  },
];

export const EVENT = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

export const PRICES = { common: 45, uncommon: 72, rare: 125, sticker: 130, erase: 60, eraseStep: 25 };
