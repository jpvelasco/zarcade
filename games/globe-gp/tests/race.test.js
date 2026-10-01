import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, DT, COUNTDOWN, ELIM_FIRST, ELIM_EVERY, simulate, medalTimes } from '../src/race.js';
import { LOCATION_BY_ID } from '../src/locations.js';
import { CAR_BY_ID } from '../src/cars.js';
import { autoGas } from '../src/input.js';

const hatch = CAR_BY_ID.hatch;

function solo(loc = 'paris', kind = 'timetrial') {
  const race = new Race({ location: LOCATION_BY_ID[loc], kind, car: hatch });
  for (let i = 0; i < (COUNTDOWN + 0.1) / DT; i++) race.step(DT);
  assert.equal(race.status, 'racing');
  return race;
}

// Moves a racer along the road by teleporting in small steps, as if driving.
function driveTo(race, r, from, to, { lateral = 0, step = 1, events = [] } = {}) {
  const t = race.track, v = r.vehicle;
  const dir = Math.sign(to - from) || 1;
  for (let d = from; dir > 0 ? d <= to : d >= to; d += step * dir) {
    const p = t.pointAt(d, lateral);
    v.x = p.x; v.z = p.z; v.y = t.heightAt(d);
    v.heading = dir > 0 ? p.heading : p.heading + Math.PI;
    v.vx = v.vz = 0;
    race.step(DT);
    events.push(...race.events);
    race.events.length = 0;
  }
  return events;
}

test('the countdown holds cars, then GO starts the race', () => {
  const race = new Race({ location: LOCATION_BY_ID.paris, kind: 'circuit', car: hatch });
  const start = { x: race.player.vehicle.x, z: race.player.vehicle.z };
  for (let i = 0; i < (COUNTDOWN - 0.2) / DT; i++) race.step(DT, { throttle: 1 });
  assert.equal(race.status, 'countdown');
  assert.equal(race.player.vehicle.x, start.x);
  for (let i = 0; i < 30; i++) race.step(DT, { throttle: 1 });
  assert.equal(race.status, 'racing');
  assert.ok(race.events.some((e) => e.type === 'go'));
  assert.equal(race.racers.length, 7);
});

test('holding the gas from the last second of the countdown gives a perfect start', () => {
  const race = new Race({ location: LOCATION_BY_ID.paris, kind: 'circuit', car: hatch });
  for (let i = 0; i < (COUNTDOWN + 0.05) / DT; i++) race.step(DT, { throttle: race.time > -0.8 ? 1 : 0 });
  assert.ok(race.player.perfect);
  const early = new Race({ location: LOCATION_BY_ID.paris, kind: 'circuit', car: hatch });
  for (let i = 0; i < (COUNTDOWN + 0.05) / DT; i++) early.step(DT, { throttle: 1 });
  assert.equal(early.player.perfect, false, 'flooring it the whole countdown does not');
});

test('automatic touch gas waits for the end of the countdown and earns the perfect start', () => {
  const race = new Race({ location: LOCATION_BY_ID.paris, kind: 'circuit', car: hatch });
  for (let i = 0; i < (COUNTDOWN + 0.05) / DT; i++) race.step(DT, { throttle: autoGas(race.time) });
  assert.ok(race.player.perfect);
  assert.equal(autoGas(-2), 0);
  assert.equal(autoGas(5), 1, 'and it stays on while racing');
});

test('laps count only after every gate, and three laps finish the race', () => {
  const race = solo();
  const r = race.player, L = race.track.length;
  const startAlong = r.along;
  driveTo(race, r, startAlong, L + 5);
  assert.equal(r.lap, 1, 'crossing the line starts lap 1');
  const events = [];
  driveTo(race, r, 5, L + 5, { events });
  assert.equal(r.lap, 2);
  assert.equal(events.filter((e) => e.type === 'gate').length, race.track.gates.length);
  assert.ok(events.some((e) => e.type === 'lap'));
  assert.equal(r.lapTimes.length, 1);
  driveTo(race, r, 5, L + 5, { events });
  assert.ok(events.some((e) => e.type === 'finalLap'));
  driveTo(race, r, 5, L + 5, { events });
  assert.ok(r.finished);
  assert.equal(race.status, 'finished');
  assert.equal(r.lapTimes.length, 3);
});

test('race distance and positions follow the leader', () => {
  const race = new Race({ location: LOCATION_BY_ID.rio, kind: 'circuit', car: hatch });
  for (let i = 0; i < (COUNTDOWN + 0.1) / DT; i++) race.step(DT);
  const p = race.player;
  const lead = race.racers.find((r) => r.position === 1);
  const ahead = lead.along;
  driveTo(race, p, p.along, race.track.length + ahead + 40, { step: 2 });
  assert.equal(p.position, 1);
  assert.ok(race.order[0] === p);
});

test('driving the wrong way warns, and backing over the line takes the lap away', () => {
  const race = solo();
  const r = race.player, L = race.track.length;
  driveTo(race, r, r.along, L + 30);
  assert.equal(r.lap, 1);
  const events = driveTo(race, r, 30, -40, { step: 0.4 });
  assert.equal(r.lap, 0, 'backed over the line');
  // Teleport-driving sets no speed, so check the warning with real motion.
  const v = r.vehicle;
  const p = race.track.pointAt(race.track.length - 60);
  v.x = v.px = p.x; v.z = v.pz = p.z; v.heading = p.heading + Math.PI;
  for (let i = 0; i < 120; i++) { race.step(DT, { throttle: 1 }); events.push(...race.events); race.events.length = 0; }
  assert.ok(r.wrongWay);
  assert.ok(events.some((e) => e.type === 'wrongWay'));
  // Turning round clears it.
  v.heading += Math.PI;
  for (let i = 0; i < 120; i++) { race.step(DT, { throttle: 1 }); events.push(...race.events); race.events.length = 0; }
  assert.equal(r.wrongWay, false);
  assert.ok(events.some((e) => e.type === 'rightWay'));
});

test('crossing back over the line and forward again restores the lap without a fake lap time', () => {
  const race = solo();
  const r = race.player, L = race.track.length;
  driveTo(race, r, r.along, L + 5);
  driveTo(race, r, 5, L + 5);
  assert.equal(r.lap, 2);
  driveTo(race, r, 5, -10, { step: 0.5 });
  assert.equal(r.lap, 1);
  driveTo(race, r, L - 10, L + 10);
  assert.equal(r.lap, 2);
  assert.equal(r.lapTimes.length, 1);
});

test('skipping gates does not count the lap and sends you back', () => {
  const race = solo('paris');
  const r = race.player, t = race.track, L = t.length;
  driveTo(race, r, r.along, L + 5);
  driveTo(race, r, 5, t.gates[2] + 5);
  // Jump far ahead (as if cutting across the infield), then cross the line.
  const events = driveTo(race, r, L - 40, L + 5, { step: 1 });
  assert.equal(r.lap, 1, 'lap not counted');
  assert.ok(events.some((e) => e.type === 'missed'));
  const back = events.find((e) => e.type === 'respawn');
  assert.ok(back && Math.abs(t.delta(back.dist, t.gates[3] - 12)) < 1, 'respawned before the missed gate');
});

test('taking a real shortcut keeps the lap valid', () => {
  const race = solo('paris');
  const r = race.player, t = race.track, L = t.length;
  const sc = t.shortcuts[0];
  assert.ok(sc, 'paris has a shortcut');
  driveTo(race, r, r.along, L + 5);
  driveTo(race, r, 5, sc.a);
  const v = r.vehicle;
  let usedShortcut = false;
  for (let k = 0; k <= 1; k += 0.01) {
    v.x = sc.ax + (sc.bx - sc.ax) * k;
    v.z = sc.az + (sc.bz - sc.az) * k;
    v.heading = Math.atan2(sc.dx, sc.dz);
    race.step(DT);
    if (r.onShortcut) usedShortcut = true;
    race.events.length = 0;
  }
  assert.ok(usedShortcut);
  assert.ok(Math.abs(t.delta(r.along, sc.b)) < 10, 'progress mapped to the end of the shortcut');
  driveTo(race, r, sc.b, L + 5);
  assert.equal(r.lap, 2, 'lap counted');
});

test('boost pads and coins work', () => {
  const race = solo('rio');
  const r = race.player, t = race.track;
  const pad = t.pads[0];
  const events = driveTo(race, r, r.along, pad.dist + 3, { lateral: pad.lateral });
  assert.ok(events.some((e) => e.type === 'pad'));
  assert.ok(r.vehicle.turbo > 0.5);
  const coin = t.coins[0];
  const near = t.nearestGlobal(coin.x, coin.z);
  const ev2 = driveTo(race, r, pad.dist + 3, coin.dist + 1, { lateral: near.lateral, step: 0.5 });
  if (coin.dist > pad.dist) assert.ok(ev2.some((e) => e.type === 'coin') || r.coins > 0);
});

test('slipstreaming close behind a rival fills the boost meter', () => {
  const race = new Race({ location: LOCATION_BY_ID.paris, kind: 'circuit', car: hatch, rivals: [{ id: 'x', name: 'X', car: 'hatch', pace: 1, skill: 1, aggression: 0, drift: 0, consistency: 1, boost: 0, offroadLove: 0 }] });
  for (let i = 0; i < (COUNTDOWN + 0.1) / DT; i++) race.step(DT);
  const [a, b] = race.racers;
  const t = race.track;
  const events = [];
  for (let i = 0; i < 90; i++) {
    const d = 200 + i * 0.5;
    for (const [r, off] of [[b, 8], [a, 0]]) {
      const p = t.pointAt(d + off, 0);
      Object.assign(r.vehicle, { x: p.x, z: p.z, heading: p.heading, vx: p.dx * 25, vz: p.dz * 25 });
    }
    a.vehicle.meter = 0;
    race.step(DT);
    events.push(...race.events);
    race.events.length = 0;
  }
  assert.ok(a.slipping, 'the trailing car slipstreams');
  assert.ok(!b.slipping, 'the leader does not');
  assert.ok(events.some((e) => e.type === 'slip') || !a.isPlayer);
});

test('elimination drops the last car every interval until one is left', () => {
  const race = simulate({ location: LOCATION_BY_ID.outback, kind: 'elimination', car: hatch, untilAll: true }, 400);
  const out = race.racers.filter((r) => r.eliminated);
  assert.equal(out.length, 6);
  const times = out.map((r) => r.elimAt).sort((x, y) => x - y);
  assert.ok(Math.abs(times[0] - ELIM_FIRST) < 0.1);
  for (let i = 1; i < times.length; i++) assert.ok(Math.abs(times[i] - times[i - 1] - ELIM_EVERY) < 0.1);
  const res = race.results();
  assert.deepEqual(res.map((r) => r.place), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(!race.racers[res[0].id].eliminated, 'the winner survived');
});

test('a race simulation is deterministic', () => {
  const a = simulate({ location: LOCATION_BY_ID.kyoto, kind: 'sprint', car: hatch }, 200);
  const b = simulate({ location: LOCATION_BY_ID.kyoto, kind: 'sprint', car: hatch }, 200);
  assert.deepEqual(a.results().map((r) => [r.key, r.time]), b.results().map((r) => [r.key, r.time]));
});

test('time trials record a ghost of the best lap and play it back', () => {
  const race = simulate({ location: LOCATION_BY_ID.tokyo, kind: 'timetrial', car: hatch, laps: 2 }, 200);
  assert.ok(race.newGhost, 'a best-lap ghost was recorded');
  assert.ok(race.newGhost.frames.length > 400);
  const replay = new Race({ location: LOCATION_BY_ID.tokyo, kind: 'timetrial', car: hatch, ghost: race.newGhost, autopilot: true });
  let seen = 0;
  for (let i = 0; i < 60 * 30; i++) { replay.step(DT); replay.events.length = 0; if (replay.ghostPose()) seen++; }
  assert.ok(seen > 60 * 20, 'ghost visible during the lap');
  const medals = medalTimes(LOCATION_BY_ID.tokyo, hatch);
  assert.ok(medals.gold < medals.silver && medals.silver < medals.bronze);
});

test('results estimate times for cars still racing', () => {
  const race = new Race({ location: LOCATION_BY_ID.paris, kind: 'sprint', car: hatch, autopilot: true });
  for (let i = 0; i < 60 * 30; i++) { race.step(DT); race.events.length = 0; }
  race.finish(race.player);
  const res = race.results();
  assert.equal(res.length, 7);
  assert.ok(res.every((r) => Number.isFinite(r.time) && r.time > 0));
  for (let i = 1; i < res.length; i++) assert.ok(res[i].place === i + 1);
});
