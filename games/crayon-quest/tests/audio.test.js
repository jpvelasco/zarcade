import test from 'node:test';
import assert from 'node:assert/strict';
import { Sound, busLevels } from '../src/audio.js';

class FakeParam {
  constructor() { this.value = 1; }
  setValueAtTime(v) { this.value = v; }
  setTargetAtTime(v) { this.value = v; }
  exponentialRampToValueAtTime(v) { this.value = v; }
}
class FakeNode {
  constructor() { this.gain = new FakeParam(); this.frequency = new FakeParam(); }
  connect(n) { return n; }
}
class FakeContext {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8; this.destination = new FakeNode(); }
  createGain() { return new FakeNode(); }
  createBuffer(_c, len) { return { getChannelData: () => new Float32Array(len) }; }
  resume() {}
}

function unlocked(soundOn, musicOn) {
  globalThis.window = { AudioContext: FakeContext };
  const s = new Sound();
  s.setSound(soundOn);
  s.setMusic(musicOn);
  s.unlock();
  clearInterval(s.musicTimer);
  return s;
}

test('Sound off silences the music too, not just effects', () => {
  assert.equal(busLevels(false, true).master, 0);
  assert.ok(busLevels(true, true).master > 0);
  assert.equal(busLevels(true, false).music, 0);
});

test('a saved Sound: off applies when audio first unlocks', () => {
  const s = unlocked(false, true);
  assert.equal(s.master.gain.value, 0);
});

test('toggling sound gates the master bus and restores it', () => {
  const s = unlocked(true, true);
  assert.ok(s.master.gain.value > 0);
  s.setSound(false);
  assert.equal(s.master.gain.value, 0);
  s.setSound(true);
  assert.ok(s.master.gain.value > 0);
  delete globalThis.window;
});
