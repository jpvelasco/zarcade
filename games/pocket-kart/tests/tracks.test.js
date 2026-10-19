import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKPOINTS, buildTrack, clearOfTrack, locate, project, validateTrack } from '../src/track.js';
import { CUPS, TRACKS, tracksOfCup } from '../src/tracks.js';
import { aiRace, allTracks, run, track } from './helpers.js';

test('three cups of four tracks, each with a unique id and its cup theme', () => {
  assert.equal(CUPS.length, 3);
  assert.equal(TRACKS.length, 12);
  assert.equal(new Set(TRACKS.map((t) => t.id)).size, 12);
  CUPS.forEach((c, i) => {
    const list = tracksOfCup(i);
    assert.equal(list.length, 4, c.name);
    for (const t of list) assert.equal(t.theme, c.theme, t.id);
  });
});

test('every track is closed, drivable and passes validation', () => {
  for (const t of allTracks()) {
    assert.deepEqual(validateTrack(t), [], t.id);
    const m = t.main;
    const gap = Math.hypot(m.x[0] - m.x[m.n - 1], m.y[0] - m.y[m.n - 1]);
    assert.ok(gap < 14, `${t.id} closes (gap ${gap})`);
    assert.ok(t.length > 6000 && t.length < 9500, `${t.id} lap length ${t.length}`);
  }
});

test('checkpoints run in order from the finish line around the lap', () => {
  for (const t of allTracks()) {
    assert.equal(t.checkpoints.length, CHECKPOINTS);
    assert.equal(t.checkpoints[0], 0);
    for (let i = 1; i < CHECKPOINTS; i++) assert.ok(t.checkpoints[i] > t.checkpoints[i - 1], `${t.id} cp ${i}`);
    assert.ok(t.checkpoints[CHECKPOINTS - 1] < t.length);
  }
});

test('pads, item boxes, bumpers and the grid sit on the road', () => {
  for (const t of allTracks()) {
    assert.ok(t.boxes.length >= 9, `${t.id} has item boxes`);
    assert.ok(t.pads.length >= 2, `${t.id} has boost pads`);
    for (const o of [...t.pads, ...t.boxes, ...t.bumpers, ...t.grid6]) {
      const p = project(t, o.x, o.y);
      assert.ok(Math.abs(p.lat) < t.main.hw[p.i], `${t.id} object at ${Math.round(o.x)},${Math.round(o.y)}`);
    }
    assert.equal(t.grid6.length, 6);
  }
});

test('decorations stay clear of every road and shortcut', () => {
  for (const t of allTracks()) {
    assert.ok(t.decorations.length > 60, `${t.id} decorated`);
    for (const d of t.decorations) assert.ok(clearOfTrack(t, d.x, d.y, 10), `${t.id} decoration on the road`);
  }
});

test('half the tracks have a shortcut that saves distance and joins the road', () => {
  const withShortcut = allTracks().filter((t) => t.shortcuts.length);
  assert.ok(withShortcut.length >= 5);
  for (const t of withShortcut) {
    for (const sc of t.shortcuts) {
      assert.ok(sc.saves > 60, `${t.id} shortcut saves ${sc.saves}`);
      assert.ok(sc.surface < 0.95 && sc.surface >= 0.42, `${t.id} shortcut surface is slow`);
      // Mid-path points are on the shortcut, and map between its two ends.
      const mid = Math.floor(sc.line.n / 2);
      const loc = locate(t, sc.line.x[mid], sc.line.y[mid]);
      assert.equal(loc.shortcut, sc.index, `${t.id} shortcut middle is claimed`);
      assert.equal(loc.surface, 'shortcut');
      const into = (loc.s - sc.sFrom + t.length) % t.length;
      assert.ok(into > 0 && into < sc.sTo - sc.sFrom, `${t.id} shortcut progress maps between its ends`);
    }
  }
});

test('locate: road, verge, then a wall that pushes back inside', () => {
  const t = track('toybox-speedway');
  const m = t.main;
  const i = 40;
  const at = (lat) => locate(t, m.x[i] + m.nx[i] * lat, m.y[i] + m.ny[i] * lat, i);
  assert.equal(at(0).surface, 'road');
  assert.ok(at(0).over < 0);
  assert.equal(at(m.hw[i] + 5).surface, 'verge');
  const out = at(m.hw[i] + t.verge + 20);
  assert.ok(out.over > 0);
  // The normal points back toward the centreline.
  assert.ok(out.normalX * m.nx[i] + out.normalY * m.ny[i] < -0.9);
});

test('building a track is deterministic', () => {
  const a = buildTrack(TRACKS[3]), b = buildTrack(TRACKS[3]);
  assert.equal(a.length, b.length);
  assert.deepEqual(a.decorations.slice(0, 5), b.decorations.slice(0, 5));
  assert.deepEqual([...a.racingLine.slice(0, 50)], [...b.racingLine.slice(0, 50)]);
});

test('an AI-only race finishes three laps on every track', () => {
  for (const t of allTracks()) {
    const race = aiRace(t);
    run(race, { maxTime: 200 });
    assert.equal(race.state, 'done', t.id);
    for (const k of race.karts) {
      assert.ok(k.finished, `${t.id}: ${k.racer.name} finished`);
      assert.equal(k.lapTimes.length, 3);
      for (const lap of k.lapTimes) assert.ok(lap > 12 && lap < 45, `${t.id} lap ${lap}`);
    }
  }
});
