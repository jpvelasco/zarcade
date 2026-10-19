import test from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICTS } from '../src/contracts.js';
import { SONGS, STEPS_PER_BAR, loopSteps, midiToHz, songFor, stepEvents, stepSeconds } from '../src/music.js';

test('every district has its own song', () => {
  const songs = DISTRICTS.map((_, chapter) => songFor(chapter));
  assert.equal(new Set(songs).size, DISTRICTS.length);
  for (const id of songs) assert.ok(SONGS[id], id);
  assert.equal(songFor(-3), songs[0]);
  assert.equal(songFor(99), songs.at(-1));
});

test('song patterns are well formed and stay in a friendly register', () => {
  for (const [id, song] of Object.entries(SONGS)) {
    assert.ok(song.tempo >= 70 && song.tempo <= 120, `${id} tempo`);
    for (const key of ['arp', 'bass']) assert.equal(song[key].length, STEPS_PER_BAR, `${id} ${key}`);
    for (const key of ['kick', 'snare', 'hat']) assert.match(song[key], /^[xo.]{16}$/, `${id} ${key}`);
    const total = loopSteps(song);
    for (const [at, , length] of song.lead) {
      assert.ok(at >= 0 && at < total && length > 0, `${id} lead note at ${at}`);
    }
    let pads = 0;
    let notes = 0;
    for (let step = 0; step < total; step++) {
      for (const event of stepEvents(song, step)) {
        assert.ok(event.steps > 0 && event.gain > 0 && event.gain <= 1);
        if (event.voice === 'pad') {
          pads++;
          assert.equal(step % STEPS_PER_BAR, 0, 'pads start on the bar');
          for (const midi of event.notes) assert.ok(midi >= 50 && midi <= 74, `${id} pad ${midi}`);
        }
        if (event.midi !== undefined) {
          notes++;
          assert.ok(event.midi >= 28 && event.midi <= 96, `${id} ${event.voice} ${event.midi}`);
        }
      }
    }
    assert.equal(pads, song.chords.length);
    assert.ok(notes > total / 2, `${id} has a melody`);
    assert.deepEqual(stepEvents(song, total + 5), stepEvents(song, 5), 'the loop repeats');
    assert.ok(stepSeconds(song) > 0.1 && stepSeconds(song) < 0.25);
  }
});

test('midi notes convert to concert pitch', () => {
  assert.equal(midiToHz(69), 440);
  assert.ok(Math.abs(midiToHz(57) - 220) < 1e-9);
});
