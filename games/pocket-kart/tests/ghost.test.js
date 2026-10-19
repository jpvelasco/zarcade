import test from 'node:test';
import assert from 'node:assert/strict';
import { GHOST_HZ, GhostRecorder, decodeGhost, encodeGhost, ghostAt } from '../src/ghost.js';

test('a ghost survives encoding to a quarter unit and a hair of heading', () => {
  const rec = new GhostRecorder();
  for (let i = 0; i <= 200; i++) {
    const t = i / 120;
    rec.record(t, 100 + t * 300, -50 + Math.sin(t) * 40, Math.sin(t * 2) * 3);
  }
  const s = rec.samples;
  assert.equal(s.length / 3, Math.floor((200 / 120) * GHOST_HZ) + 1);
  const g = decodeGhost(encodeGhost(s));
  assert.equal(g.length, s.length);
  for (let i = 0; i < s.length; i += 3) {
    assert.ok(Math.abs(g[i] - s[i]) <= 0.13);
    assert.ok(Math.abs(g[i + 1] - s[i + 1]) <= 0.13);
    assert.ok(Math.abs(Math.sin(g[i + 2]) - Math.sin(s[i + 2])) < 0.001);
  }
});

test('ghostAt interpolates position and takes the short way round on heading', () => {
  const g = new Float32Array([0, 0, 3.1, 10, 20, -3.1]);
  const p = ghostAt(g, 0.5 / GHOST_HZ);
  assert.ok(Math.abs(p.x - 5) < 1e-6 && Math.abs(p.y - 10) < 1e-6);
  assert.ok(Math.abs(Math.abs(p.h) - Math.PI) < 0.05);
  const end = ghostAt(g, 99);
  assert.equal(end.x, 10);
});

test('broken ghosts decode to null', () => {
  for (const bad of [null, 5, '', 'abc', '!!!!!!!!!!', 'AAAAAAA', 'A'.repeat(300000)]) assert.equal(decodeGhost(bad), null, String(bad).slice(0, 12));
});
