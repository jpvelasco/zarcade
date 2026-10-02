// One shift in the bakery. Pure rules: no DOM, no canvas, no audio. The page
// drives it with `tick(dt)` plus the three player actions (`tapStation`,
// `serve`, `select`), and drains `events` for sound and sparkles.
import { Rng } from './rng.js';
import {
  RECIPES, STATIONS, firstStation, nextStation, stepTime, getCustomer, heartsFor, tipForHearts,
} from './recipes.js';
import { BASE_EFFECTS, scaledTime } from './upgrades.js';

// A bake stays perfect for this long before it starts to colour, then takes
// this long again to end up crispy. Crispy is the floor: it never gets worse.
export const HOLD_SECONDS = 4;
export const SCORCH_SECONDS = 4;
// Serving again inside this window keeps the tip combo going.
export const COMBO_SECONDS = 3.5;
export const COMBO_MAX = 5;
export const COMBO_STEP = 0.125;
// Once the clock runs out the shop still finishes what it started, for a while.
export const WIND_DOWN = 12;
// A customer who can see their order being made relaxes a little.
export const BUSY_PATIENCE = 0.7;
// A dish nobody is waiting for any more (its customer had to go) goes into the
// window display once the counter needs the room, so the shop can never jam.
export const STALE_SECONDS = 8;
const LEAVE_SECONDS = 1.1;

export class Shift {
  constructor(plan, { effects = BASE_EFFECTS, seed = 1 } = {}) {
    this.plan = plan;
    this.eff = effects;
    this.rng = new Rng(seed);
    this.time = 0;
    this.phase = 'running';
    this.closing = false;
    this.closingFor = 0;
    this.endTimer = 0;
    this.nextId = 1;
    this.events = [];
    this.selected = null;
    this.helperTimer = effects.helper ? effects.helperEvery : Infinity;

    this.stations = [];
    for (const kind of plan.stations) {
      const copies = kind === 'oven' ? effects.ovenCount : kind === 'mixer' ? effects.mixerCount : 1;
      for (let c = 0; c < copies; c++) {
        this.stations.push({
          index: this.stations.length, kind, copy: c, item: null,
          name: STATIONS[kind].name, short: STATIONS[kind].short, bakes: !!STATIONS[kind].bakes,
          flash: 0, bump: 0,
        });
      }
    }

    this.counterSlots = effects.counterSlots;
    this.counter = [];
    this.seats = Array.from({ length: plan.seats }, (_, i) => ({ index: i, customer: null }));
    this.waiting = plan.customers.map((c, i) => this.makeCustomer(c, i));
    this.active = [];
    this.leaving = [];

    this.coins = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.lastServeAt = -99;
    this.stats = {
      served: 0, crispy: 0, happy: 0, missed: 0, bestCombo: 0, perfectTips: 0,
      dishes: Object.create(null),
    };
  }

  makeCustomer(spec, order) {
    const kind = getCustomer(spec.kind);
    return {
      id: `c${order + 1}`,
      kind: spec.kind,
      name: kind.name,
      regular: !!kind.regular,
      arriveAt: spec.at,
      seat: -1,
      state: 'queued',
      patience: 1,
      // Seconds this customer takes to go from three hearts to none.
      span: this.plan.patience * kind.patience * this.eff.patienceScale,
      leaveTimer: 0,
      happy: false,
      tickets: spec.order.map((recipe, i) => ({
        id: `t${order + 1}-${i + 1}`, recipe, state: 'waiting', customer: `c${order + 1}`,
      })),
    };
  }

  // ---------------------------------------------------------------- helpers

  get left() {
    return Math.max(0, this.plan.seconds - this.time);
  }

  get done() {
    return this.phase === 'done';
  }

  // Tickets that still need making or finishing, in arrival order: the rail.
  tickets() {
    const list = [];
    for (const c of this.active) for (const t of c.tickets) if (t.state !== 'served') list.push(t);
    return list;
  }

  customerOf(ticket) {
    return this.active.find((c) => c.id === ticket.customer) || null;
  }

  stationOf(kind) {
    return this.stations.filter((s) => s.kind === kind);
  }

  freeStation(kind) {
    return this.stations.find((s) => s.kind === kind && !s.item) || null;
  }

  hearts(customer) {
    return heartsFor(customer.patience);
  }

  // The ticket a station would start if tapped now: the player's pick when it
  // fits, otherwise the one whose customer is closest to giving up.
  nextTicketFor(station) {
    if (!STATIONS[station.kind].start) return null;
    const options = [];
    for (const c of this.active) {
      for (const t of c.tickets) {
        if (t.state !== 'waiting') continue;
        if (firstStation(t.recipe) !== station.kind) continue;
        options.push({ ticket: t, customer: c });
      }
    }
    if (!options.length) return null;
    if (this.selected) {
      const chosen = options.find((o) => o.ticket.id === this.selected);
      if (chosen) return chosen.ticket;
    }
    options.sort((a, b) => a.customer.patience - b.customer.patience
      || a.customer.arriveAt - b.customer.arriveAt);
    return options[0].ticket;
  }

  // ----------------------------------------------------------- the actions

  // Tap a station: pass a finished item along, or start the next thing.
  tapStation(index) {
    const station = this.stations[index];
    if (!station || this.phase === 'done') return { ok: false, reason: 'over' };
    if (station.item) {
      if (station.item.state !== 'ready') {
        this.push({ type: 'bonk', station: index });
        return { ok: false, reason: 'working' };
      }
      return this.advance(station);
    }
    const ticket = this.nextTicketFor(station);
    if (!ticket) {
      this.push({ type: 'bonk', station: index });
      return { ok: false, reason: 'nothing' };
    }
    return this.startTicket(station, ticket);
  }

  startTicket(station, ticket) {
    const dur = scaledTime(stepTime(ticket.recipe, station.kind), station.kind, this.eff);
    station.item = {
      id: this.nextId++, recipe: ticket.recipe, ticket: ticket.id, customer: ticket.customer,
      step: 0, state: 'work', t: 0, dur, scorch: 0, quality: 'perfect', since: this.time,
    };
    ticket.state = 'cooking';
    if (this.selected === ticket.id) this.selected = null;
    station.bump = 1;
    this.push({ type: 'start', station: station.index, recipe: ticket.recipe });
    return { ok: true, started: ticket.id };
  }

  // Move a finished item to the next station in its recipe, or plate it.
  advance(station) {
    const item = station.item;
    const next = nextStation(item.recipe, STATIONS[station.kind].id);
    if (next) {
      const target = this.freeStation(next);
      if (!target) {
        const blocked = this.stationOf(next);
        for (const s of blocked) s.flash = 1;
        this.push({ type: 'blocked', station: station.index, target: blocked.length ? blocked[0].index : -1 });
        return { ok: false, reason: 'full', station: blocked.length ? blocked[0].index : -1 };
      }
      station.item = null;
      target.item = {
        ...item,
        step: item.step + 1,
        state: 'work',
        t: 0,
        dur: scaledTime(stepTime(item.recipe, next), next, this.eff),
        scorch: 0,
        since: this.time,
      };
      target.bump = 1;
      this.push({ type: 'move', from: station.index, to: target.index, recipe: item.recipe });
      return { ok: true, moved: target.index };
    }
    if (this.counter.length >= this.counterSlots) {
      this.push({ type: 'counterfull', station: station.index });
      return { ok: false, reason: 'counterfull' };
    }
    station.item = null;
    this.counter.push({
      id: item.id, recipe: item.recipe, quality: item.quality, ticket: item.ticket,
      customer: item.customer, at: this.time, idle: 0,
    });
    this.push({ type: 'plate', station: station.index, recipe: item.recipe, quality: item.quality });
    return { ok: true, plated: item.recipe };
  }

  // Who should get the dish on the counter: whoever is closest to leaving and
  // still wants one. The dish's original customer has no special claim, so a
  // bake is never wasted when somebody has had to go.
  matchFor(dish) {
    let best = null;
    for (const c of this.active) {
      if (c.state !== 'seated') continue;
      const ticket = c.tickets.find((t) => t.state !== 'served' && t.recipe === dish.recipe);
      if (!ticket) continue;
      if (!best || c.patience < best.customer.patience) best = { customer: c, ticket };
    }
    return best;
  }

  // The best serve available right now, if any.
  bestServe() {
    let best = null;
    for (const dish of this.counter) {
      const match = this.matchFor(dish);
      if (!match) continue;
      const score = match.customer.patience - (dish.quality === 'crispy' ? 0.001 : 0);
      if (!best || score < best.score) best = { dish, ...match, score };
    }
    return best;
  }

  // Tapping a customer hands them the best dish on the counter that they are
  // waiting for: the same move as tapping the counter, aimed.
  serveSeat(index) {
    if (this.phase === 'done') return { ok: false, reason: 'over' };
    const customer = this.seats[index] && this.seats[index].customer;
    if (!customer || customer.state !== 'seated') return this.serve();
    let best = null;
    for (const dish of this.counter) {
      const ticket = customer.tickets.find((t) => t.state !== 'served' && t.recipe === dish.recipe);
      if (!ticket) continue;
      const score = dish.quality === 'crispy' ? 1 : 0;
      if (!best || score < best.score) best = { dish, ticket, score };
    }
    if (!best) return this.serve();
    return this.handOver(best.dish, customer, best.ticket);
  }

  serve() {
    if (this.phase === 'done') return { ok: false, reason: 'over' };
    if (!this.counter.length) {
      this.push({ type: 'bonk', counter: true });
      return { ok: false, reason: 'empty' };
    }
    const best = this.bestServe();
    if (!best) {
      this.push({ type: 'bonk', counter: true });
      return { ok: false, reason: 'nobody' };
    }
    return this.handOver(best.dish, best.customer, best.ticket);
  }

  handOver(dish, customer, ticket) {
    this.counter.splice(this.counter.indexOf(dish), 1);
    if (ticket.id !== dish.ticket) this.passClaim(dish, ticket);
    ticket.state = 'served';
    const kind = getCustomer(customer.kind);
    const hearts = this.hearts(customer);
    const quality = dish.quality === 'crispy' ? 0.5 : 1;
    const tip = (1 + (tipForHearts(hearts) - 1) * kind.tip) * (1 + this.eff.tipBonus);
    const fresh = this.time - this.lastServeAt <= COMBO_SECONDS;
    if (dish.quality !== 'crispy') this.combo = fresh ? Math.min(COMBO_MAX, this.combo + 1) : 1;
    else if (this.combo === 0) this.combo = 1;
    this.comboTimer = COMBO_SECONDS;
    this.lastServeAt = this.time;
    const comboMult = 1 + COMBO_STEP * Math.max(0, this.combo - 1);
    const coins = Math.max(1, Math.round(RECIPES[dish.recipe].value * kind.pay * quality * tip * comboMult));
    this.coins += coins;
    this.stats.served++;
    this.stats.dishes[dish.recipe] = (this.stats.dishes[dish.recipe] || 0) + 1;
    if (dish.quality === 'crispy') this.stats.crispy++;
    if (hearts === 3) this.stats.perfectTips++;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
    this.push({
      type: 'serve', recipe: dish.recipe, coins, combo: this.combo, hearts,
      quality: dish.quality, seat: customer.seat, customer: customer.id,
    });
    if (customer.tickets.every((t) => t.state === 'served')) this.finish(customer);
    return { ok: true, coins, combo: this.combo, recipe: dish.recipe, seat: customer.seat };
  }

  // A dish made for one order is going to fill another. The order it was made
  // for must not stay marked as cooking with nothing in the kitchen: it takes
  // over whatever was being made for the order being filled, or goes back to
  // waiting so a station can start it again.
  passClaim(dish, ticket) {
    const own = this.findTicket(dish.ticket);
    if (!own || own.state !== 'cooking') return;
    const work = ticket.state === 'cooking' ? this.itemFor(ticket.id) : null;
    if (work) {
      work.ticket = own.id;
      work.customer = own.customer;
    } else {
      const owner = this.active.find((c) => c.id === own.customer);
      own.state = owner && owner.state === 'seated' ? 'waiting' : 'dropped';
    }
  }

  findTicket(id) {
    for (const c of this.active) for (const t of c.tickets) if (t.id === id) return t;
    return null;
  }

  // The dish or station item currently being made for a ticket, if any.
  itemFor(ticketId) {
    for (const s of this.stations) if (s.item && s.item.ticket === ticketId) return s.item;
    return this.counter.find((d) => d.ticket === ticketId) || null;
  }

  finish(customer) {
    customer.state = 'leaving';
    customer.happy = true;
    customer.leaveTimer = LEAVE_SECONDS;
    this.stats.happy++;
    this.push({ type: 'happy', seat: customer.seat, customer: customer.id, hearts: this.hearts(customer) });
  }

  // Patience ran out. They wave, say "maybe tomorrow", and go. No penalty.
  giveUp(customer) {
    customer.state = 'leaving';
    customer.happy = false;
    customer.leaveTimer = LEAVE_SECONDS;
    this.stats.missed++;
    for (const t of customer.tickets) if (t.state === 'waiting') t.state = 'dropped';
    this.push({ type: 'left', seat: customer.seat, customer: customer.id });
  }

  select(ticketId) {
    this.selected = this.selected === ticketId ? null : ticketId;
    return this.selected;
  }

  // ------------------------------------------------------------------ clock

  tick(dt) {
    if (this.phase === 'done') return;
    this.time += dt;
    if (!this.closing && this.time >= this.plan.seconds) {
      this.closing = true;
      this.push({ type: 'closing' });
    }
    if (this.closing) this.closingFor += dt;

    for (const station of this.stations) {
      station.flash = Math.max(0, station.flash - dt * 2.5);
      station.bump = Math.max(0, station.bump - dt * 3);
      const item = station.item;
      if (!item) continue;
      item.t += dt;
      if (item.state === 'work') {
        if (item.t >= item.dur) {
          item.state = 'ready';
          item.t = 0;
          this.push({ type: 'ding', station: station.index, recipe: item.recipe, oven: station.bakes });
        }
        continue;
      }
      if (!station.bakes || !this.plan.burn || item.quality === 'crispy') continue;
      const hold = HOLD_SECONDS + this.eff.holdBonus;
      if (item.t <= hold) continue;
      const was = item.scorch;
      item.scorch = Math.min(1, (item.t - hold) / SCORCH_SECONDS);
      if (was === 0) this.push({ type: 'smoke', station: station.index });
      if (item.scorch >= 1) {
        item.quality = 'crispy';
        this.push({ type: 'crispy', station: station.index, recipe: item.recipe });
      }
    }

    // Seating: whoever is due and waiting takes the next free seat.
    for (const seat of this.seats) {
      if (seat.customer || this.closing) continue;
      const i = this.waiting.findIndex((c) => c.arriveAt <= this.time);
      if (i < 0) continue;
      const customer = this.waiting.splice(i, 1)[0];
      customer.state = 'seated';
      customer.seat = seat.index;
      seat.customer = customer;
      this.active.push(customer);
      this.push({ type: 'arrive', seat: seat.index, customer: customer.id, kind: customer.kind });
    }

    for (const customer of this.active) {
      if (customer.state !== 'seated') continue;
      const busy = customer.tickets.some((t) => t.state === 'cooking' || t.state === 'served');
      const rate = (1 / customer.span) * (busy ? BUSY_PATIENCE : 1);
      const before = this.hearts(customer);
      customer.patience = Math.max(0, customer.patience - rate * dt);
      const after = this.hearts(customer);
      if (after < before && after > 0) this.push({ type: 'heart', seat: customer.seat, hearts: after });
      if (customer.patience <= 0) this.giveUp(customer);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const customer = this.active[i];
      if (customer.state !== 'leaving') continue;
      customer.leaveTimer -= dt;
      if (customer.leaveTimer > 0) continue;
      customer.state = 'gone';
      this.seats[customer.seat].customer = null;
      this.active.splice(i, 1);
      this.leaving.push(customer);
    }

    // Tidy the counter: a dish nobody wants any more only takes up room.
    for (let i = this.counter.length - 1; i >= 0; i--) {
      const dish = this.counter[i];
      dish.idle = this.matchFor(dish) ? 0 : dish.idle + dt;
      if (dish.idle < STALE_SECONDS || this.counter.length < this.counterSlots) continue;
      this.counter.splice(i, 1);
      this.push({ type: 'tidy', recipe: dish.recipe });
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    if (this.eff.helper) {
      this.helperTimer -= dt;
      if (this.helperTimer <= 0) {
        this.helperTimer = this.eff.helperEvery;
        this.helperAct();
      }
    }

    const nobodyLeft = !this.active.length && (this.closing || !this.waiting.length);
    if (nobodyLeft || this.closingFor > WIND_DOWN) {
      this.endTimer += dt;
      if (this.endTimer > 0.45) this.phase = 'done';
    } else {
      this.endTimer = 0;
    }
  }

  // Flour the mouse takes one job off your hands: serve if anybody is waiting,
  // otherwise rescue whatever is closest to catching colour.
  helperAct() {
    if (this.bestServe()) {
      const before = this.coins;
      const res = this.serve();
      if (res.ok) this.push({ type: 'helper', coins: this.coins - before });
      return;
    }
    let pick = null;
    for (const station of this.stations) {
      const item = station.item;
      if (!item || item.state !== 'ready') continue;
      const risk = station.bakes ? 1 + item.scorch : 0;
      if (!pick || risk > pick.risk) pick = { station, risk };
    }
    if (!pick) return;
    const res = this.advance(pick.station);
    if (res.ok) this.push({ type: 'helper', station: pick.station.index });
  }

  push(event) {
    this.events.push(event);
    if (this.events.length > 64) this.events.shift();
  }

  drain() {
    const list = this.events;
    this.events = [];
    return list;
  }

  // ---------------------------------------------------------------- results

  result() {
    return {
      coins: this.coins,
      par: this.plan.par,
      served: this.stats.served,
      crispy: this.stats.crispy,
      happy: this.stats.happy,
      missed: this.stats.missed,
      bestCombo: this.stats.bestCombo,
      dishes: { ...this.stats.dishes },
      seconds: Math.round(this.time),
    };
  }
}
