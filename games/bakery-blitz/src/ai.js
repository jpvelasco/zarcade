// A baker that plays by itself. It drives the same three actions a person has,
// at a capped taps-per-second, so the tests can ask "could a child clear this
// day?" and the title screen can run an attract mode.
import { RECIPES, STATIONS, nextStation } from './recipes.js';
import { Shift, WIND_DOWN } from './sim.js';

// Taps per second. A seven-year-old with a mouse manages about three; `pro` is
// a practised player.
export const PACE = { kid: 1.8, steady: 2.8, pro: 4.2 };

function canAdvance(shift, station) {
  const item = station.item;
  if (!item || item.state !== 'ready') return false;
  const next = nextStation(item.recipe, station.kind);
  if (next) return !!shift.freeStation(next);
  return shift.counter.length < shift.counterSlots;
}

function patienceOf(shift, item) {
  const customer = shift.active.find((c) => c.id === item.customer);
  return customer ? customer.patience : 0.5;
}

// Ready items that can move, worst-first by how much trouble they are in.
function movable(shift) {
  return shift.stations
    .filter((s) => canAdvance(shift, s))
    .map((s) => ({
      station: s,
      scorch: s.bakes ? s.item.scorch : -1,
      toOven: nextStation(s.item.recipe, s.kind) === 'oven',
      plates: !nextStation(s.item.recipe, s.kind),
      patience: patienceOf(shift, s.item),
    }));
}

// One decision. Ordered rules beat a scoring function here: each line is a
// thing a player would say out loud.
export function chooseAction(shift) {
  if (shift.done) return null;
  const serve = shift.bestServe();
  const moves = movable(shift);
  const ovens = moves.filter((m) => m.station.bakes);

  // 1. The counter is full: nothing can be plated until something is handed over.
  if (serve && shift.counter.length >= shift.counterSlots) return { kind: 'serve' };

  // 2. Get bakes out of the oven, most-browned first.
  if (ovens.length) {
    ovens.sort((a, b) => b.scorch - a.scorch || a.patience - b.patience);
    return { kind: 'tap', index: ovens[0].station.index };
  }

  // 3. Somebody is on their last heart, or a combo is still warm.
  if (serve) {
    const lastHeart = shift.hearts(serve.customer) <= 1;
    const comboWarm = shift.combo > 0 && shift.comboTimer > 0.9;
    if (lastHeart || comboWarm) return { kind: 'serve' };
  }

  // 4. Keep the ovens busy: feed one that is standing empty.
  const ovenFree = shift.stations.some((s) => s.kind === 'oven' && !s.item);
  if (ovenFree) {
    const feed = moves.filter((m) => m.toOven);
    if (feed.length) {
      feed.sort((a, b) => a.patience - b.patience);
      return { kind: 'tap', index: feed[0].station.index };
    }
  }

  // 5. Otherwise serve whoever is waiting.
  if (serve) return { kind: 'serve' };

  // 6. Pass anything else along, most impatient customer first.
  if (moves.length) {
    moves.sort((a, b) => (b.plates ? 1 : 0) - (a.plates ? 1 : 0) || a.patience - b.patience);
    return { kind: 'tap', index: moves[0].station.index };
  }

  // 7. Start something new, unless the oven queue is already backed up.
  const starts = shift.stations.filter((s) => !s.item && STATIONS[s.kind].start);
  if (starts.length) {
    const ovenCount = shift.stations.filter((s) => s.kind === 'oven').length;
    const ovenQueue = shift.stations.filter((s) => s.item && nextStation(s.item.recipe, s.kind) === 'oven').length;
    const options = [];
    for (const station of starts) {
      const ticket = shift.nextTicketFor(station);
      if (!ticket) continue;
      if (RECIPES[ticket.recipe].steps.includes('oven') && ovenQueue >= ovenCount + 1) continue;
      const customer = shift.active.find((c) => c.id === ticket.customer);
      options.push({ index: station.index, patience: customer ? customer.patience : 1 });
    }
    if (options.length) {
      options.sort((a, b) => a.patience - b.patience);
      return { kind: 'tap', index: options[0].index };
    }
  }
  return null;
}

export function doAction(shift, action) {
  if (!action) return null;
  if (action.kind === 'serve') return shift.serve();
  return shift.tapStation(action.index);
}

// Plays a whole shift headlessly. `aps` is the tap budget per second, so the
// autoplayer cannot cheat by acting on every frame.
export function playShift(plan, { effects, seed = 1, aps = PACE.steady, dt = 1 / 60 } = {}) {
  const shift = new Shift(plan, { effects, seed });
  let budget = 1;
  let guard = 0;
  const limit = Math.ceil(((plan.seconds + WIND_DOWN + 4) / dt) + 10);
  while (!shift.done && guard++ < limit) {
    shift.tick(dt);
    budget = Math.min(budget + dt * aps, 2);
    while (budget >= 1) {
      const action = chooseAction(shift);
      if (!action) break;
      doAction(shift, action);
      budget -= 1;
    }
    if (budget > 1) budget = 1;
    shift.drain();
  }
  return { shift, result: shift.result(), coins: shift.coins };
}
