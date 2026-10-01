// Turn-based card battles. DOM-free: every function works on the run object
// (run.battle, run.hp, run.rng) and pushes small events onto
// run.battle.events so the page can animate what happened.
import { MONSTER, cardDef, needsTarget } from './data.js';
import { range, shuffle, weighted } from './rng.js';
import { stickerSum } from './stickers.js';

export const HAND_SIZE = 5;
export const MAX_HAND = 10;
export const BASE_ENERGY = 3;
export const MAX_ENEMIES = 3;

const emptyMagic = () => ({ armor: 0, glitter: 0, quick: 0, spark: 0, shadow: 0, grow: 0, drip: 0 });

function makeEnemy(run, id, uid) {
  const def = MONSTER[id];
  let hp = range(run.rng, def.hp[0], def.hp[1]);
  if (run.gentle) hp = Math.max(1, Math.round(hp * 0.75));
  return {
    uid, id, name: def.name, hp, maxHp: hp, block: 0,
    power: 0, smudge: 0, soggy: 0, dizzy: 0,
    moveIdx: 0, history: [], intent: null, dead: false,
  };
}

export function createBattle(run, enemyIds, kind = 'battle') {
  const b = {
    kind, turn: 0, phase: 'player', over: null,
    enemies: [], nextUid: 1,
    player: { block: 0, energy: 0, power: 0, smudge: 0, soggy: 0, soggyFresh: false, dizzy: 0, magic: emptyMagic() },
    draw: shuffle(run.rng, run.deck.map((c) => ({ ...c }))),
    hand: [], discard: [], poofed: [],
    playedThisTurn: 0, damageDealt: 0, damageTaken: 0, cardsPlayed: 0,
    events: [],
  };
  run.battle = b;
  for (const id of enemyIds) b.enemies.push(makeEnemy(run, id, b.nextUid++));

  // Sticker battle-start effects.
  b.player.power += stickerSum(run, 'startPower');
  const sm = stickerSum(run, 'startSmudgeAll');
  const dz = stickerSum(run, 'startDizzyAll');
  for (const e of b.enemies) {
    e.smudge += sm;
    e.dizzy += dz;
  }
  startPlayerTurn(run);
  const startBlock = stickerSum(run, 'startBlock');
  if (startBlock) gainBlock(b, startBlock);
  return b;
}

export function living(b) {
  return b.enemies.filter((e) => !e.dead);
}

function emit(b, ev) {
  b.events.push(ev);
}

function gainBlock(b, n) {
  if (n <= 0) return;
  b.player.block += n;
  emit(b, { type: 'block', who: 'hero', amount: n });
}

// Damage after Power, Dizzy (25% softer) and Soggy (50% more).
export function attackDamage(base, attacker, defender) {
  let dmg = base + (attacker ? attacker.power : 0);
  if (attacker && attacker.dizzy > 0) dmg = Math.floor(dmg * 0.75);
  if (defender && defender.soggy > 0) dmg = Math.floor(dmg * 1.5);
  return Math.max(0, dmg);
}

function hitEnemy(run, e, amount, source = 'card') {
  const b = run.battle;
  if (e.dead) return 0;
  const blocked = Math.min(e.block, amount);
  e.block -= blocked;
  const dealt = Math.min(e.hp, amount - blocked);
  e.hp -= dealt;
  b.damageDealt += dealt;
  emit(b, { type: 'hit', who: 'enemy', uid: e.uid, amount: amount - blocked, blocked, source });
  if (e.hp <= 0) killEnemy(run, e);
  return dealt;
}

function killEnemy(run, e) {
  const b = run.battle;
  e.hp = 0;
  e.dead = true;
  e.intent = null;
  emit(b, { type: 'defeat', uid: e.uid, id: e.id });
  if (!run.met.includes(e.id)) run.met.push(e.id);
  if (living(b).length === 0) finish(run, 'won');
}

function hitHero(run, amount, attacker) {
  const b = run.battle;
  const p = b.player;
  const blocked = Math.min(p.block, amount);
  p.block -= blocked;
  const dealt = Math.min(run.hp, amount - blocked);
  run.hp -= dealt;
  b.damageTaken += dealt;
  emit(b, { type: 'hit', who: 'hero', amount: amount - blocked, blocked, from: attacker ? attacker.uid : 0 });
  const thorns = stickerSum(run, 'thorns');
  if (attacker && thorns && !attacker.dead) hitEnemy(run, attacker, thorns, 'thorns');
  if (run.hp <= 0) finish(run, 'lost');
}

function finish(run, result) {
  const b = run.battle;
  if (b.over) return;
  b.over = result;
  emit(b, { type: 'over', result });
}

function drawCards(run, n) {
  const b = run.battle;
  for (let i = 0; i < n; i++) {
    if (b.draw.length === 0) {
      if (b.discard.length === 0) break;
      b.draw = shuffle(run.rng, b.discard);
      b.discard = [];
      emit(b, { type: 'shuffle' });
    }
    const card = b.draw.pop();
    if (b.hand.length >= MAX_HAND) b.discard.push(card);
    else {
      b.hand.push(card);
      emit(b, { type: 'draw', uid: card.uid });
    }
  }
}

function chooseIntent(run, e) {
  const def = MONSTER[e.id];
  const b = run.battle;
  const crowded = living(b).length >= MAX_ENEMIES;
  let move;
  if (def.pattern === 'cycle') {
    for (let tries = 0; tries < def.moves.length; tries++) {
      move = def.moves[e.moveIdx % def.moves.length];
      e.moveIdx++;
      if (!(move.t === 'summon' && crowded)) break;
    }
  } else {
    const h = e.history;
    const banned = h.length >= 2 && h[h.length - 1] === h[h.length - 2] ? h[h.length - 1] : -1;
    const entries = def.moves.map((m, i) => [i, i === banned || (m.t === 'summon' && crowded) ? 0 : m.w || 1]);
    const idx = weighted(run.rng, entries.some(([, w]) => w > 0) ? entries : def.moves.map((m, i) => [i, 1]));
    move = def.moves[idx];
    e.moveIdx = idx;
  }
  e.intent = { ...move, idx: def.moves.indexOf(move) };
}

// What a monster's intent will really do this turn, for the intent bubble.
export function intentView(b, e) {
  const m = e.intent;
  if (!m || e.dead) return null;
  const view = { t: m.t, hits: m.hits || 1, block: m.block || 0, power: m.power || 0 };
  if (m.dmg) view.dmg = attackDamage(m.dmg, e, b.player);
  if (m.soggy) view.soggy = m.soggy;
  if (m.dizzy) view.dizzy = m.dizzy;
  if (m.smudge) view.smudge = m.smudge;
  if (m.t === 'summon') view.summon = m.id;
  return view;
}

// Total damage the hero will take next enemy turn if nothing changes.
export function incomingDamage(b) {
  let total = 0;
  for (const e of living(b)) {
    const v = intentView(b, e);
    if (v && v.dmg) total += v.dmg * v.hits;
  }
  return total;
}

export function startPlayerTurn(run) {
  const b = run.battle;
  const p = b.player;
  b.turn++;
  b.phase = 'player';
  b.playedThisTurn = 0;
  p.block = 0;
  if (p.smudge > 0) {
    const n = p.smudge;
    p.smudge--;
    const dealt = Math.min(run.hp, n);
    run.hp -= dealt;
    b.damageTaken += dealt;
    emit(b, { type: 'smudge', who: 'hero', amount: n });
    if (run.hp <= 0) {
      finish(run, 'lost');
      return;
    }
  }
  let energy = BASE_ENERGY + stickerSum(run, 'energy') + p.magic.spark;
  if (b.turn === 1) energy += stickerSum(run, 'firstEnergy');
  if (b.turn % 3 === 0) energy += stickerSum(run, 'everyThird');
  p.energy = energy;
  const turnBlock = stickerSum(run, 'turnBlock');
  if (turnBlock) gainBlock(b, turnBlock);
  if (p.magic.grow) {
    p.power += p.magic.grow;
    emit(b, { type: 'power', who: 'hero', amount: p.magic.grow });
  }
  if (p.magic.drip) {
    for (const e of living(b)) e.smudge += p.magic.drip;
    emit(b, { type: 'status', who: 'enemies', status: 'smudge', amount: p.magic.drip });
  }
  let draw = HAND_SIZE + stickerSum(run, 'draw') + p.magic.quick;
  if (b.turn === 1) draw += stickerSum(run, 'firstDraw');
  drawCards(run, draw);
  for (const e of living(b)) chooseIntent(run, e);
  emit(b, { type: 'turn', turn: b.turn });
}

export function canPlay(run, handIndex) {
  const b = run.battle;
  if (!b || b.over || b.phase !== 'player') return false;
  const card = b.hand[handIndex];
  if (!card) return false;
  return cardDef(card).cost <= b.player.energy;
}

// Resolve the target for a card: the chosen monster, or the only one left.
export function resolveTarget(b, def, targetUid) {
  if (!needsTarget(def)) return null;
  const alive = living(b);
  const chosen = alive.find((e) => e.uid === targetUid);
  if (chosen) return chosen;
  return alive.length === 1 ? alive[0] : alive[0] || null;
}

export function playCard(run, handIndex, targetUid) {
  const b = run.battle;
  if (!canPlay(run, handIndex)) return false;
  const card = b.hand[handIndex];
  const def = cardDef(card);
  const target = resolveTarget(b, def, targetUid);
  if (needsTarget(def) && !target) return false;
  const p = b.player;
  const fx = def.fx;
  p.energy -= def.cost;
  b.hand.splice(handIndex, 1);
  b.playedThisTurn++;
  b.cardsPlayed++;
  run.stats.cardsPlayed++;
  emit(b, { type: 'play', uid: card.uid, id: card.id, target: target ? target.uid : 0, kind: def.kind });

  if (fx.block) gainBlock(b, fx.block);
  if (fx.special === 'doubleShield') gainBlock(b, p.block);
  if (fx.special === 'shieldHit') hitEnemy(run, target, attackDamage(p.block, p, target));
  if (fx.special === 'flurry') {
    for (let i = 0; i < b.playedThisTurn && !target.dead; i++) hitEnemy(run, target, attackDamage(fx.dmg, p, target));
  } else if (fx.dmg) {
    const hits = fx.hits || 1;
    for (let i = 0; i < hits; i++) {
      if (fx.aoe) for (const e of living(b)) hitEnemy(run, e, attackDamage(fx.dmg, p, e));
      else if (!target.dead) hitEnemy(run, target, attackDamage(fx.dmg, p, target));
    }
  }
  if (target && !target.dead) {
    if (fx.smudge) target.smudge += fx.smudge;
    if (fx.soggy) target.soggy += fx.soggy;
    if (fx.dizzy) target.dizzy += fx.dizzy;
    if (fx.special === 'doubleSmudge') target.smudge *= 2;
    if (fx.smudge || fx.soggy || fx.dizzy || fx.special === 'doubleSmudge') emit(b, { type: 'status', who: 'enemy', uid: target.uid });
  }
  for (const [key, s] of [['smudgeAll', 'smudge'], ['soggyAll', 'soggy'], ['dizzyAll', 'dizzy']]) {
    if (!fx[key]) continue;
    for (const e of living(b)) e[s] += fx[key];
    emit(b, { type: 'status', who: 'enemies', status: s, amount: fx[key] });
  }
  if (fx.power) {
    p.power += fx.power;
    emit(b, { type: 'power', who: 'hero', amount: fx.power });
  }
  if (fx.heal) {
    const healed = Math.min(run.maxHp - run.hp, fx.heal);
    run.hp += healed;
    emit(b, { type: 'heal', who: 'hero', amount: healed });
  }
  if (fx.energy) p.energy += fx.energy;
  if (fx.draw) drawCards(run, fx.draw);
  // Doodle Buddy: every card played after it gives Shield.
  if (p.magic.shadow) gainBlock(b, p.magic.shadow);
  if (fx.magic) for (const [k, v] of Object.entries(fx.magic)) p.magic[k] += v;

  if (def.kind === 'magic' || def.poof) b.poofed.push(card);
  else b.discard.push(card);
  return true;
}

// End the hero's turn: end-of-turn magic, discard, then the monsters act and
// a new hero turn starts (unless the battle ended).
export function endTurn(run) {
  const b = run.battle;
  if (!b || b.over || b.phase !== 'player') return false;
  endPlayerTurn(run);
  if (!b.over) {
    beginEnemyTurn(run);
    for (const e of b.enemies.slice()) {
      if (b.over) break;
      enemyAct(run, e.uid);
    }
    if (!b.over) endEnemyTurn(run);
  }
  return true;
}

// The steps of endTurn, exposed so the page can pace the animation.
export function endPlayerTurn(run) {
  const b = run.battle;
  const p = b.player;
  if (p.magic.armor) gainBlock(b, p.magic.armor);
  if (p.magic.glitter) for (const e of living(b)) hitEnemy(run, e, attackDamage(p.magic.glitter, null, e), 'magic');
  b.discard.push(...b.hand);
  b.hand = [];
  if (p.dizzy > 0) p.dizzy--;
  for (const e of living(b)) if (e.soggy > 0) e.soggy--;
  b.phase = 'enemy';
  emit(b, { type: 'endturn' });
}

export function beginEnemyTurn(run) {
  const b = run.battle;
  for (const e of living(b)) {
    e.block = 0;
    if (e.smudge > 0) {
      const n = e.smudge;
      e.smudge--;
      const dealt = Math.min(e.hp, n);
      e.hp -= dealt;
      b.damageDealt += dealt;
      emit(b, { type: 'smudge', who: 'enemy', uid: e.uid, amount: n });
      if (e.hp <= 0) killEnemy(run, e);
    }
  }
}

export function enemyAct(run, uid) {
  const b = run.battle;
  const e = b.enemies.find((x) => x.uid === uid);
  if (!e || e.dead || b.over || !e.intent) return;
  const m = e.intent;
  const p = b.player;
  emit(b, { type: 'act', uid: e.uid, t: m.t });
  if (m.dmg) {
    const hits = m.hits || 1;
    for (let i = 0; i < hits && !b.over && !e.dead; i++) hitHero(run, attackDamage(m.dmg, e, p), e);
  }
  if (b.over || e.dead) return;
  if (m.block) {
    e.block += m.block;
    emit(b, { type: 'block', who: 'enemy', uid: e.uid, amount: m.block });
  }
  if (m.power) {
    e.power += m.power;
    emit(b, { type: 'power', who: 'enemy', uid: e.uid, amount: m.power });
  }
  if (m.soggy) {
    p.soggy += m.soggy;
    p.soggyFresh = true;
  }
  if (m.dizzy) p.dizzy += m.dizzy;
  if (m.smudge) p.smudge += m.smudge;
  if (m.soggy || m.dizzy || m.smudge) emit(b, { type: 'status', who: 'hero' });
  if (m.t === 'summon' && living(b).length < MAX_ENEMIES) {
    const ne = makeEnemy(run, m.id, b.nextUid++);
    b.enemies.push(ne);
    if (!run.met.includes(ne.id)) run.met.push(ne.id);
    emit(b, { type: 'summon', uid: ne.uid, id: ne.id });
  }
  e.history.push(m.idx);
  if (e.history.length > 4) e.history.shift();
}

export function endEnemyTurn(run) {
  const b = run.battle;
  const p = b.player;
  for (const e of living(b)) if (e.dizzy > 0) e.dizzy--;
  if (p.soggyFresh) p.soggyFresh = false;
  else if (p.soggy > 0) p.soggy--;
  // Clear away defeated monsters that are no longer animating.
  b.enemies = b.enemies.filter((e) => !e.dead);
  startPlayerTurn(run);
}

export function takeEvents(b) {
  const evs = b.events;
  b.events = [];
  return evs;
}

