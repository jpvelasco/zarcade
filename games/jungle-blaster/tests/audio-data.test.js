import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_TRACK, TRACKS, chordTones, noteMidi, parseTrack } from '../src/music.js';
import { STAGES } from '../src/levels.js';
import { FONT, GLYPH_H, GLYPH_W, NTSC, THEMES, lighten, retroColor } from '../src/palette.js';

test('every stage has its own chiptune track and every track parses', () => {
  for (const stage of STAGES) assert.ok(TRACKS[STAGE_TRACK[stage.id]], `${stage.id} track`);
  assert.equal(new Set(Object.values(STAGE_TRACK)).size, STAGES.length);
  for (const [name, spec] of Object.entries(TRACKS)) {
    const t = parseTrack(spec);
    assert.equal(t.steps, 64, `${name} is four bars`);
    const notes = [...t.lead, ...t.bass, ...t.harmony].flat();
    assert.ok(notes.length > 40, `${name} has notes`);
    for (const n of notes) assert.ok(n.midi >= 28 && n.midi <= 96, `${name} note ${n.midi} in a sane range`);
    assert.ok(spec.tempo >= 90 && spec.tempo <= 190);
  }
});

test('note and chord names convert correctly', () => {
  assert.equal(noteMidi('A4'), 69);
  assert.equal(noteMidi('C4'), 60);
  assert.equal(noteMidi('F#5'), 78);
  assert.equal(noteMidi('Bb3'), 58);
  assert.deepEqual(chordTones('Am').tones.map((m) => m - chordTones('Am').root), [0, 3, 7, 12]);
  assert.throws(() => noteMidi('H2'));
});

test('2600 mode maps any colour into a 128-colour palette', () => {
  assert.equal(NTSC.length, 128);
  const set = new Set(NTSC.map((c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`));
  for (const theme of Object.values(THEMES)) {
    for (const hex of [...theme.sky, theme.top, ...theme.dirt]) assert.ok(set.has(retroColor(hex)), `${hex} maps into the palette`);
  }
  assert.equal(lighten('#000000', 0.5), '#808080');
});

test('the pixel font covers letters, digits and HUD punctuation', () => {
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?-+:/<') {
    assert.ok(FONT[ch], `glyph ${ch}`);
    assert.equal(FONT[ch].length, GLYPH_W * GLYPH_H);
  }
});
