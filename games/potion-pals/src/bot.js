// The demo alchemist. Drives the real Alchemy API, so it doubles as the title
// screen's attract mode and as `?autopilot` for browser checks.
import { ITEM, frontier } from './recipes.js';
import { Rng, mix } from './rng.js';

export const ADD_GAP = 0.5;
export const BREW_GAP = 1.7;

export class Bot {
  constructor(alchemy, seed = 7) {
    this.a = alchemy;
    this.rng = new Rng(mix(seed >>> 0, 0x2b1d));
    this.wait = 0.8;
    this.plan = null;
    this.fizzleNext = false;
  }

  // Choose a recipe the player could finish right now, favouring potions so
  // the demo keeps producing pals.
  choose() {
    const known = this.a.knownSet;
    const front = frontier(known).filter((id) => ITEM[id].inputs.every((i) => ITEM[i].kind !== 'potion'));
    if (!front.length) return null;
    const potions = front.filter((id) => ITEM[id].kind === 'potion');
    const pool = potions.length && this.rng.next() < 0.45 ? potions : front;
    const id = pool[this.rng.int(pool.length)];
    return ITEM[id].inputs.slice();
  }

  // One tick. Returns an action for the page to animate, or null.
  step(dt, dateKey) {
    this.wait -= dt;
    if (this.wait > 0) return null;
    if (!this.plan) {
      // Every so often, mix two random things to show off the fizzle.
      if (this.fizzleNext) {
        this.fizzleNext = false;
        const shelf = this.a.shelf();
        this.plan = [shelf[this.rng.int(shelf.length)], shelf[this.rng.int(shelf.length)]];
      } else {
        this.plan = this.choose();
      }
      if (!this.plan) {
        this.wait = 2;
        return null;
      }
      this.a.clear();
    }
    if (this.plan.length) {
      const id = this.plan.shift();
      this.wait = ADD_GAP;
      if (this.a.add(id)) return { kind: 'add', id };
      this.plan = null;
      return null;
    }
    this.plan = null;
    this.wait = BREW_GAP;
    this.fizzleNext = this.rng.next() < 0.14;
    return { kind: 'brew', result: this.a.brew(dateKey) };
  }
}

// Fast-forward a fresh workshop by brewing `count` discoveries, for the title
// screen's demo treehouse and for tests.
export function simulate(alchemy, count = 40, seed = 3) {
  const rng = new Rng(mix(seed >>> 0, 0x77f1));
  for (let n = 0; n < count; n++) {
    const known = alchemy.knownSet;
    const front = frontier(known);
    if (!front.length) break;
    const potions = front.filter((id) => ITEM[id].kind === 'potion');
    const pool = potions.length && rng.next() < 0.5 ? potions : front;
    const id = pool[rng.int(pool.length)];
    alchemy.clear();
    for (const input of ITEM[id].inputs) alchemy.add(input);
    alchemy.brew('1970-01-01');
  }
  alchemy.events.length = 0;
  return alchemy;
}
