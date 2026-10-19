// Playtest bots. The smart bot plays a reasonable, readable strategy and is
// used both for balance tests and the browser ?autopilot mode. The random
// bot is the control: it should do clearly worse. DOM-free.
import { CARD, EVENT, cardDef, needsTarget } from './data.js';
import { attackDamage, canPlay, endTurn, incomingDamage, intentView, living, playCard } from './battle.js';
import {
  available, buyCard, buySticker, cancelPick, chooseEvent, choosePick, enterNode, eventOptionEnabled,
  finishBattle, leaveNode, openChest, pickChoices, restColor, restNap, startErase, takeRewardCard,
} from './run.js';
import { int, makeRng } from './rng.js';

// How much the bot likes each card when drafting (0 = skip).
const TIER = {
  scribble: 0, doodle_shield: 0, big_swirl: 4, cardboard_bash: 4, paint_splat: 4, eraser_dash: 4,
  zigzag: 4, crayon_toss: 3, rainbow_wave: 5, smudge_poke: 5, doodle_dash: 6, heavy_marker: 6,
  dot_dot_dot: 3, paper_plane: 5, cardboard_wall: 4, quick_sketch: 5, water_spill: 4,
  tickle_feather: 2, snack_time: 2, juice_box: 4,
  color_storm: 7, shield_bash: 4, big_idea: 5, sharpener: 7, crayon_armor: 7, bubble_wrap: 6,
  doodle_stomp: 7, sticky_glue: 5, scribble_frenzy: 6, deep_breath: 5, glitter_bomb: 6, big_hug: 4,
  giant_stamp: 8, masterpiece: 8, thinking_cap: 7, super_crayon: 7, pillow_fort: 7, doodle_buddy: 7,
  gold_star: 6, imagination: 7, crayon_hero: 5, helmet_bonk: 6, fortress: 5, brave_banner: 8,
  splash_zone: 6, double_drip: 6, magic_marker: 8, paper_stars: 5, sneaky_step: 6, flurry: 7,
};

export function tier(id) {
  return TIER[id] ?? 3;
}

// ------------------------------------------------------------ battle

function cardValue(run, def, target) {
  const b = run.battle;
  const p = b.player;
  const fx = def.fx;
  const incoming = Math.max(0, incomingDamage(b) - p.block);
  let v = 0;
  const dmgTo = (e, base, hits = 1) => {
    if (!e || e.dead) return 0;
    const per = attackDamage(base, p, e);
    const total = per * hits;
    const eff = Math.min(total, e.hp + e.block);
    let val = Math.max(0, eff - e.block * 0.6);
    if (total >= e.hp + e.block) {
      const iv = intentView(b, e);
      val += 6 + (iv && iv.dmg ? iv.dmg * iv.hits * 1.2 : 2);
    }
    return val;
  };
  if (fx.special === 'flurry') v += dmgTo(target, fx.dmg, b.playedThisTurn + 1);
  else if (fx.special === 'shieldHit') v += dmgTo(target, p.block);
  else if (fx.dmg) {
    if (fx.aoe) for (const e of living(b)) v += dmgTo(e, fx.dmg, fx.hits || 1);
    else v += dmgTo(target, fx.dmg, fx.hits || 1);
  }
  let block = fx.block || 0;
  if (fx.special === 'doubleShield') block = p.block;
  if (block) v += Math.min(block, incoming) * (incoming >= run.hp ? 2.5 : 1.15) + Math.max(0, block - incoming) * 0.1;
  const alive = living(b);
  const bulk = (e) => (e ? Math.min(e.hp, 40) / 40 : 0);
  if (fx.smudge && target) v += fx.smudge * 1.6 * bulk(target) + 1;
  if (fx.smudgeAll) for (const e of alive) v += fx.smudgeAll * 1.4 * bulk(e) + 0.5;
  if (fx.special === 'doubleSmudge' && target) v += target.smudge * 1.5 * bulk(target);
  if (fx.soggy && target) v += 2.2 * fx.soggy * bulk(target) + 1;
  if (fx.soggyAll) for (const e of alive) v += 1.8 * fx.soggyAll * bulk(e);
  if (fx.dizzy && target) {
    const iv = intentView(b, target);
    v += (iv && iv.dmg ? iv.dmg * iv.hits * 0.25 : 0.5) + fx.dizzy * 1.2;
  }
  if (fx.power) v += fx.power * (def.kind === 'magic' ? 6 : 3);
  if (fx.heal) v += Math.min(run.maxHp - run.hp, fx.heal) * 0.6;
  if (fx.draw) v += fx.draw * 3.2;
  if (fx.energy) v += fx.energy * 4.5;
  const m = fx.magic;
  if (m) {
    const longFight = alive.reduce((s, e) => s + e.hp, 0) > 30 ? 1 : 0.35;
    v += longFight * ((m.armor || 0) * 3 + (m.glitter || 0) * alive.length * 3 + (m.quick || 0) * 10 + (m.spark || 0) * 13 + (m.shadow || 0) * 6 + (m.grow || 0) * 9 + (m.drip || 0) * alive.length * 3.5);
  }
  return v;
}

export function bestPlay(run) {
  const b = run.battle;
  let best = null;
  for (let i = 0; i < b.hand.length; i++) {
    if (!canPlay(run, i)) continue;
    const def = cardDef(b.hand[i]);
    const targets = needsTarget(def) ? living(b) : [null];
    for (const t of targets) {
      const v = cardValue(run, def, t);
      const score = v / (def.cost + 0.7);
      if (v > 0.5 && (!best || score > best.score)) best = { i, uid: t ? t.uid : 0, score };
    }
  }
  return best;
}

export function botBattleStep(run, rng = null) {
  const b = run.battle;
  if (rng) {
    const playable = b.hand.map((_, i) => i).filter((i) => canPlay(run, i));
    if (playable.length && int(rng, playable.length + 1) > 0) {
      const i = playable[int(rng, playable.length)];
      const alive = living(b);
      return playCard(run, i, alive[int(rng, alive.length)].uid) ? 'play' : endTurn(run) && 'end';
    }
    endTurn(run);
    return 'end';
  }
  const play = bestPlay(run);
  if (play && playCard(run, play.i, play.uid)) return 'play';
  endTurn(run);
  return 'end';
}

// ------------------------------------------------------------ choices

function chooseNode(run, rng) {
  const opts = available(run);
  if (rng) return opts[int(rng, opts.length)];
  const hpPct = run.hp / run.maxHp;
  const value = (id) => {
    const n = run.map.nodes[id];
    // Look one step past this node too.
    const after = n.next.map((x) => run.map.nodes[x].type);
    const base = {
      battle: run.floorBattles < 3 ? 6 : 4,
      elite: hpPct > 0.75 ? 6 : hpPct > 0.55 ? 1 : -8,
      rest: hpPct < 0.5 ? 10 : hpPct < 0.7 ? 5 : 1,
      shop: run.gold >= 110 ? 8 : run.gold >= 70 ? 4 : 0,
      treasure: 8,
      mystery: 4,
      boss: 0,
    }[n.type];
    const lookahead = after.includes('rest') && hpPct < 0.6 ? 2 : 0;
    return base + lookahead + n.col * 0.01;
  };
  return opts.slice().sort((a, b) => value(b) - value(a))[0];
}

function upgradePriority(card) {
  const def = CARD[card.id];
  return tier(card.id) + (def.rarity === 'starter' ? (card.id === 'scribble' ? 2 : 1.5) : 0) + (def.kind === 'magic' ? 2 : 0);
}

function choosePickCard(run, rng) {
  const cards = pickChoices(run);
  if (!cards.length) return null;
  if (rng) return cards[int(rng, cards.length)].uid;
  const mode = run.pick.mode;
  if (mode === 'remove') {
    const strike = cards.find((c) => c.id === 'scribble' && !c.up) || cards.find((c) => c.id === 'doodle_shield' && !c.up);
    return (strike || cards.slice().sort((a, b) => tier(a.id) - tier(b.id))[0]).uid;
  }
  if (mode === 'copy') return cards.slice().sort((a, b) => tier(b.id) - tier(a.id))[0].uid;
  return cards.slice().sort((a, b) => upgradePriority(b) - upgradePriority(a))[0].uid;
}

// One decision outside battle. Returns false when there was nothing to do.
export function botStep(run, { random = false, rng = null } = {}) {
  const r = random ? rng : null;
  if (run.phase === 'over') return false;
  if (run.pick) {
    const uid = choosePickCard(run, r);
    if (uid === null || !choosePick(run, uid)) cancelPick(run);
    return true;
  }
  switch (run.phase) {
    case 'map': return enterNode(run, chooseNode(run, r));
    case 'battle': {
      if (run.battle.over) return finishBattle(run);
      botBattleStep(run, r);
      return true;
    }
    case 'reward': {
      const rw = run.reward;
      if (rw.picked === null && rw.cards.length) {
        if (r) {
          const i = int(r, rw.cards.length + 1);
          if (i < rw.cards.length) takeRewardCard(run, i);
        } else {
          const ranked = rw.cards.map((id, i) => [i, tier(id)]).sort((a, b) => b[1] - a[1]);
          const threshold = run.deck.length > 20 ? 7 : run.deck.length > 15 ? 5 : 3;
          if (ranked[0][1] >= threshold) takeRewardCard(run, ranked[0][0]);
        }
      }
      leaveNode(run);
      return true;
    }
    case 'rest': {
      if (!run.rest.done) {
        if (r) { if (int(r, 2) || !restColor(run)) restNap(run); }
        else if (run.hp / run.maxHp < 0.6 || !restColor(run)) restNap(run);
        if (run.pick) return true;
      }
      leaveNode(run);
      return true;
    }
    case 'shop': {
      const s = run.shop;
      if (!r) {
        if (!s.erased && run.gold >= s.erasePrice && startErase(run)) return true;
        const cards = s.cards.map((c, i) => [i, c]).filter(([, c]) => !c.sold && c.price <= run.gold && tier(c.id) >= (run.deck.length > 18 ? 7 : 5))
          .sort((a, b) => tier(b[1].id) - tier(a[1].id));
        if (cards.length && buyCard(run, cards[0][0])) return true;
        const st = s.stickers.findIndex((x) => !x.sold && x.price <= run.gold);
        if (st >= 0 && buySticker(run, st)) return true;
      }
      leaveNode(run);
      return true;
    }
    case 'treasure': openChest(run); leaveNode(run); return true;
    case 'event': {
      const e = run.event;
      if (!e.result) {
        const ev = EVENT[e.id];
        const opts = ev.options.map((o, i) => i).filter((i) => eventOptionEnabled(run, ev.options[i]));
        let i = opts[0];
        if (r) i = opts[int(r, opts.length)];
        else if (run.hp / run.maxHp < 0.45) i = opts.find((k) => /heal/.test(ev.options[k].effect)) ?? opts[opts.length - 1];
        chooseEvent(run, i);
        return true;
      }
      leaveNode(run);
      return true;
    }
    default: return false;
  }
}

// Play a whole run. Returns the run (finished, or stopped at maxSteps).
export function playRun(run, { random = false, seed = 1, maxSteps = 20000 } = {}) {
  const rng = random ? makeRng(seed) : null;
  for (let i = 0; i < maxSteps && run.phase !== 'over'; i++) botStep(run, { random, rng });
  return run;
}
