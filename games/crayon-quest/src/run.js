// One climb up the sketchbook tower. The whole run is a JSON-serialisable
// object (RNG state included) so it can be saved after every action and the
// daily page is the same for everyone on the same day. DOM-free.
import { CARDS, ENCOUNTERS, EVENTS, EVENT, HERO, HEROES, PRICES, STICKERS, cardDef, CARD } from './data.js';
import { createBattle } from './battle.js';
import { generateMap, choices } from './map.js';
import { int, makeRng, next, pick, derive } from './rng.js';
import { stickerSum } from './stickers.js';

export const FLOOR_COUNT = 3;
export const START_GOLD = 60;

// The daily page picks its hero from the seed, so locked heroes can be tried.
export function dailyHero(seed) {
  return HEROES[derive(seed >>> 0, 'hero').s % HEROES.length].id;
}

export function newRun({ seed, hero = 'kid', daily = false, dateKey = null, gentle = false }) {
  seed >>>= 0;
  if (daily) hero = dailyHero(seed);
  const h = HERO[hero];
  const run = {
    v: 1, seed, daily, dateKey, hero, gentle: daily ? false : !!gentle,
    rng: makeRng(seed ^ 0x9e3779b9),
    hp: h.hp, maxHp: h.hp, gold: START_GOLD,
    deck: [], nextUid: 1, stickers: [h.sticker],
    floor: 0, map: generateMap(seed, 0), at: null, visited: [],
    phase: 'map', battle: null, nodeKind: null, reward: null, shop: null, event: null, pick: null, rest: null, treasure: null,
    floorBattles: 0, lastEncounter: '', usedEvents: [], eraseCount: 0,
    met: [], seenCards: [], seenStickers: [h.sticker],
    stats: { battles: 0, elites: 0, bosses: 0, turns: 0, cardsPlayed: 0, goldEarned: 0, nodes: 0, ms: 0 },
    result: null, score: 0, log: [],
  };
  for (const [id, n] of h.deck) for (let i = 0; i < n; i++) addCard(run, id);
  return run;
}

export function addCard(run, id, up = false) {
  const card = { uid: run.nextUid++, id, up };
  run.deck.push(card);
  seeCard(run, id);
  return card;
}

function seeCard(run, id) {
  if (!run.seenCards.includes(id)) run.seenCards.push(id);
}

function seeSticker(run, id) {
  if (!run.seenStickers.includes(id)) run.seenStickers.push(id);
}

export function addSticker(run, id) {
  if (run.stickers.includes(id)) return false;
  run.stickers.push(id);
  seeSticker(run, id);
  const st = STICKERS.find((s) => s.id === id);
  if (st.fx.maxHp) {
    run.maxHp += st.fx.maxHp;
    run.hp += st.fx.maxHp;
  }
  return true;
}

function heal(run, n) {
  const healed = Math.max(0, Math.min(run.maxHp - run.hp, Math.round(n)));
  run.hp += healed;
  return healed;
}

function hurt(run, n) {
  run.hp = Math.max(1, run.hp - n);
}

// ------------------------------------------------------------ map

export function available(run) {
  if (run.phase !== 'map') return [];
  return choices(run.map, run.at);
}

export function enterNode(run, id) {
  if (!available(run).includes(id)) return false;
  const node = run.map.nodes[id];
  run.at = id;
  run.visited.push(id);
  run.stats.nodes++;
  run.nodeKind = node.type;
  switch (node.type) {
    case 'battle': startFight(run, 'battle'); break;
    case 'elite': startFight(run, 'elite'); break;
    case 'boss': startFight(run, 'boss'); break;
    case 'rest': run.phase = 'rest'; run.rest = { done: false }; break;
    case 'shop': openShop(run); break;
    case 'treasure': openTreasure(run); break;
    case 'mystery': openMystery(run); break;
    default: run.phase = 'map';
  }
  return true;
}

function encounterFor(run, kind) {
  const table = ENCOUNTERS[run.floor];
  if (kind === 'boss') return table.boss;
  if (kind === 'elite') return pick(run.rng, table.elite);
  const list = run.floorBattles < 2 ? table.easy : table.hard;
  let enc = pick(run.rng, list);
  for (let i = 0; i < 4 && enc.join() === run.lastEncounter; i++) enc = pick(run.rng, list);
  return enc;
}

export function startFight(run, kind, enemies = null) {
  const enc = enemies || encounterFor(run, kind);
  run.lastEncounter = enc.join();
  run.fightKind = kind;
  if (kind === 'battle') run.floorBattles++;
  createBattle(run, enc, kind);
  for (const id of enc) if (!run.met.includes(id)) run.met.push(id);
  run.phase = 'battle';
}

// Called by the page (or bot) once the battle reports it is over.
export function finishBattle(run) {
  const b = run.battle;
  if (!b || !b.over) return false;
  run.stats.turns += b.turn;
  if (b.over === 'lost') {
    run.battle = null;
    endRun(run, 'lost');
    return true;
  }
  const kind = run.fightKind;
  run.stats.battles++;
  if (kind === 'elite') run.stats.elites++;
  if (kind === 'boss') run.stats.bosses++;
  const healAfter = stickerSum(run, 'healAfter');
  const healed = healAfter ? heal(run, healAfter) : 0;
  const goldBase = kind === 'boss' ? 70 + int(run.rng, 11) : kind === 'elite' ? 30 + int(run.rng, 9) : 12 + int(run.rng, 8);
  const gold = Math.round(goldBase * (1 + stickerSum(run, 'goldMult')));
  run.gold += gold;
  run.stats.goldEarned += gold;
  let sticker = null;
  if (kind === 'elite' || kind === 'boss') {
    sticker = randomSticker(run, kind === 'boss' ? 'boss' : 'common');
    if (sticker) addSticker(run, sticker);
  }
  run.battle = null;
  run.reward = { gold, sticker, healed, cards: cardChoices(run, kind), picked: null, kind };
  run.phase = 'reward';
  return true;
}

function cardPool(run, rarity) {
  return CARDS.filter((c) => c.rarity === rarity && (c.hero === null || c.hero === run.hero));
}

function rollRarity(run, kind) {
  if (kind === 'boss' || kind === 'rare') return 'rare';
  const r = next(run.rng);
  if (kind === 'elite') return r < 0.12 ? 'rare' : r < 0.52 ? 'uncommon' : 'common';
  if (kind === 'shop') return r < 0.1 ? 'rare' : r < 0.45 ? 'uncommon' : 'common';
  return r < 0.05 ? 'rare' : r < 0.35 ? 'uncommon' : 'common';
}

export function cardChoices(run, kind, count = 3 + stickerSum(run, 'choices')) {
  const out = [];
  for (let guard = 0; out.length < count && guard < 60; guard++) {
    const rarity = rollRarity(run, kind);
    const pool = cardPool(run, rarity).filter((c) => !out.includes(c.id));
    if (!pool.length) continue;
    // Hero signature cards show up a bit more often.
    const heroCards = pool.filter((c) => c.hero);
    const id = heroCards.length && next(run.rng) < 0.25 ? pick(run.rng, heroCards).id : pick(run.rng, pool).id;
    out.push(id);
  }
  for (const id of out) seeCard(run, id);
  return out;
}

export function randomSticker(run, rarity) {
  let pool = STICKERS.filter((s) => s.rarity === rarity && !run.stickers.includes(s.id));
  if (!pool.length) pool = STICKERS.filter((s) => s.rarity !== 'starter' && !run.stickers.includes(s.id));
  if (!pool.length) return null;
  return pick(run.rng, pool).id;
}

export function takeRewardCard(run, index) {
  const r = run.reward;
  if (run.phase !== 'reward' || !r || r.picked !== null || !r.cards[index]) return false;
  addCard(run, r.cards[index]);
  r.picked = index;
  return true;
}

// Leave the current room: back to the map, up to the next page, or the win.
export function leaveNode(run) {
  if (run.phase === 'over') return;
  if (run.nodeKind === 'boss' && run.phase !== 'battle') {
    if (run.floor >= FLOOR_COUNT - 1) {
      endRun(run, 'won');
      return;
    }
    run.floor++;
    run.map = generateMap(run.seed, run.floor);
    run.at = null;
    run.floorBattles = 0;
    heal(run, (run.maxHp - run.hp) * 0.5);
  }
  run.phase = 'map';
  run.nodeKind = null;
  run.reward = null;
  run.shop = null;
  run.event = null;
  run.pick = null;
  run.rest = null;
  run.treasure = null;
}

// ------------------------------------------------------------ rest

export function restNap(run) {
  if (run.phase !== 'rest' || run.rest.done) return 0;
  const healed = heal(run, run.maxHp * (0.3 + stickerSum(run, 'restBonus')));
  run.rest = { done: true, healed };
  return healed;
}

export function restColor(run) {
  if (run.phase !== 'rest' || run.rest.done || !upgradable(run).length) return false;
  run.pick = { mode: 'upgrade', from: 'rest', cost: 0 };
  return true;
}

export function upgradable(run) {
  return run.deck.filter((c) => !c.up && CARD[c.id].up);
}

// ------------------------------------------------------------ deck picks

export function pickChoices(run) {
  if (!run.pick) return [];
  if (run.pick.mode === 'upgrade') return upgradable(run);
  return run.deck.slice();
}

export function choosePick(run, uid) {
  const p = run.pick;
  if (!p) return false;
  const card = pickChoices(run).find((c) => c.uid === uid);
  if (!card) return false;
  if (p.mode === 'upgrade') card.up = true;
  else if (p.mode === 'remove') {
    if (run.deck.length <= 5) return false;
    run.deck.splice(run.deck.indexOf(card), 1);
    if (p.from === 'shop') {
      run.gold -= p.cost;
      run.eraseCount++;
      run.shop.erased = true;
    }
  } else if (p.mode === 'copy') addCard(run, card.id, card.up);
  const name = cardDef(card).name;
  run.pick = null;
  if (p.from === 'rest') run.rest = { done: true, upgraded: card.id };
  if (p.from === 'event') run.event.result = `${p.mode === 'upgrade' ? 'Colored in' : p.mode === 'remove' ? 'Erased' : 'Copied'} ${name}!`;
  return true;
}

export function cancelPick(run) {
  if (!run.pick) return false;
  const from = run.pick.from;
  run.pick = null;
  if (from === 'event') run.event.result = 'You changed your mind. That is OK!';
  return true;
}

// ------------------------------------------------------------ shop

function price(run, base) {
  return Math.round(base * (0.9 + next(run.rng) * 0.2));
}

function openShop(run) {
  const cards = [];
  const kinds = ['common', 'common', 'uncommon', 'shop', 'shop'];
  for (const kind of kinds) {
    for (let tries = 0; tries < 10; tries++) {
      const rarity = kind === 'shop' ? rollRarity(run, 'shop') : kind;
      const pool = cardPool(run, rarity).filter((c) => !cards.some((x) => x.id === c.id));
      if (!pool.length) continue;
      const c = pick(run.rng, pool);
      cards.push({ id: c.id, price: price(run, PRICES[rarity]), sold: false });
      seeCard(run, c.id);
      break;
    }
  }
  const stickers = [];
  for (let i = 0; i < 2; i++) {
    const pool = STICKERS.filter((s) => s.rarity === 'common' && !run.stickers.includes(s.id) && !stickers.some((x) => x.id === s.id));
    if (!pool.length) break;
    const s = pick(run.rng, pool);
    stickers.push({ id: s.id, price: price(run, PRICES.sticker), sold: false });
    seeSticker(run, s.id);
  }
  run.shop = { cards, stickers, erasePrice: PRICES.erase + PRICES.eraseStep * run.eraseCount, erased: false };
  run.phase = 'shop';
}

export function buyCard(run, i) {
  const item = run.shop?.cards[i];
  if (!item || item.sold || run.gold < item.price) return false;
  run.gold -= item.price;
  item.sold = true;
  addCard(run, item.id);
  return true;
}

export function buySticker(run, i) {
  const item = run.shop?.stickers[i];
  if (!item || item.sold || run.gold < item.price) return false;
  run.gold -= item.price;
  item.sold = true;
  addSticker(run, item.id);
  return true;
}

export function startErase(run) {
  const s = run.shop;
  if (!s || s.erased || run.gold < s.erasePrice || run.deck.length <= 5) return false;
  run.pick = { mode: 'remove', from: 'shop', cost: s.erasePrice };
  return true;
}

// ------------------------------------------------------------ treasure

function openTreasure(run) {
  const sticker = randomSticker(run, 'common');
  const gold = 20 + int(run.rng, 16);
  run.treasure = { sticker, gold, opened: false };
  run.phase = 'treasure';
}

export function openChest(run) {
  const t = run.treasure;
  if (!t || t.opened) return false;
  t.opened = true;
  run.gold += t.gold;
  run.stats.goldEarned += t.gold;
  if (t.sticker) addSticker(run, t.sticker);
  return true;
}

// ------------------------------------------------------------ mystery

function openMystery(run) {
  // Now and then a mystery page is a sneaky battle instead.
  if (next(run.rng) < 0.12) {
    run.nodeKind = 'battle';
    startFight(run, 'battle');
    return;
  }
  let pool = EVENTS.filter((e) => !run.usedEvents.includes(e.id));
  if (!pool.length) pool = EVENTS.slice();
  const ev = pick(run.rng, pool);
  run.usedEvents.push(ev.id);
  run.event = { id: ev.id, result: null };
  run.phase = 'event';
}

export function eventOptionEnabled(run, option) {
  if (option.cost && run.gold < option.cost) return false;
  if (option.effect === 'upgrade' && !upgradable(run).length) return false;
  if (option.effect === 'remove' && run.deck.length <= 5) return false;
  return true;
}

export function chooseEvent(run, index) {
  if (run.phase !== 'event' || !run.event || run.event.result) return false;
  const ev = EVENT[run.event.id];
  const opt = ev.options[index];
  if (!opt || !eventOptionEnabled(run, opt)) return false;
  const [effect, arg] = opt.effect.split(':');
  const n = Number(arg) || 0;
  const e = run.event;
  switch (effect) {
    case 'gold': run.gold += n; run.stats.goldEarned += n; e.result = `You got ${n} gold!`; break;
    case 'heal': e.result = `You healed ${heal(run, n)} HP.`; break;
    case 'maxhp': run.maxHp += n; run.hp += n; e.result = `Max HP +${n}!`; break;
    case 'hurt': hurt(run, n); e.result = `Ouch! You lost ${n} HP, but you got away.`; break;
    case 'none': e.result = 'You hop around the puddle. Boing, boing!'; break;
    case 'puddle':
      hurt(run, 6);
      run.reward = { gold: 0, sticker: null, healed: 0, cards: cardChoices(run, 'rare'), picked: null, kind: 'event' };
      run.phase = 'reward';
      e.result = 'Splash! Pick a sparkly card.';
      break;
    case 'sticker': {
      hurt(run, 5);
      const s = randomSticker(run, 'common');
      if (s) addSticker(run, s);
      e.result = s ? 'Got it! A new sticker for your collection.' : 'The sticker was blank. Oh well!';
      e.sticker = s;
      break;
    }
    case 'vend': {
      run.gold -= opt.cost;
      const pool = cardPool(run, 'uncommon');
      const id = pick(run.rng, pool).id;
      addCard(run, id);
      e.result = `Clunk! Out pops ${CARD[id].name}!`;
      e.card = id;
      break;
    }
    case 'upgrade': run.pick = { mode: 'upgrade', from: 'event', cost: 0 }; break;
    case 'remove': run.pick = { mode: 'remove', from: 'event', cost: 0 }; break;
    case 'copy': run.pick = { mode: 'copy', from: 'event', cost: 0 }; break;
    case 'fight': {
      const table = ENCOUNTERS[run.floor];
      run.event = null;
      run.nodeKind = 'battle';
      startFight(run, 'battle', pick(run.rng, table.hard));
      return true;
    }
    default: e.result = 'Nothing happens.';
  }
  return true;
}

// ------------------------------------------------------------ end

export function scoreRun(run) {
  const s = run.stats;
  let score = s.battles * 10 + s.elites * 35 + s.bosses * 100 + s.nodes * 2 + run.floor * 50;
  if (run.result === 'won') score += 250 + run.hp * 2;
  return score;
}

export function endRun(run, result) {
  run.result = result;
  run.phase = 'over';
  run.score = scoreRun(run);
}

// For the album and results.
export function floorReached(run) {
  return run.floor + 1;
}

export function deckSorted(run) {
  const order = { attack: 0, skill: 1, magic: 2 };
  return run.deck.slice().sort((a, b) => {
    const da = cardDef(a);
    const db = cardDef(b);
    return order[da.kind] - order[db.kind] || da.cost - db.cost || da.name.localeCompare(db.name);
  });
}

