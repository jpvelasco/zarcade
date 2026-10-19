import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { cabinets, withCabinets, START, END } from '../readme.mjs';

const require = createRequire(import.meta.url);
const { GAMES } = require('../../arcade/games.js');

test('the README cabinet gallery matches the arcade manifest (run `npm run readme` if not)', async () => {
  // Normalize line endings: a CRLF checkout (Windows autocrlf) would differ
  // from the LF-generated block by bytes only, not by stale content.
  const norm = (s) => s.replace(/\r\n/g, '\n');
  const text = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
  assert.equal(norm(withCabinets(text)), norm(text));
});

test('every game gets one cabinet, with its cover and folder', () => {
  const md = cabinets();
  for (const g of GAMES) {
    assert.equal(md.split(`src="games/${g.slug}/cover.svg"`).length - 1, 1, `${g.slug} appears once`);
    assert.ok(md.includes(`href="games/${g.slug}/"`), `${g.slug} links to its folder`);
  }
  assert.ok(md.startsWith(START) && md.endsWith(END));
});

test('titles and taglines are escaped, and empty shelves are skipped', () => {
  const md = cabinets([{ slug: 'x', title: 'A <b> & "c"', tagline: 'one & two', genre: 'Racing' }]);
  assert.ok(md.includes('A &lt;b&gt; &amp; &quot;c&quot;'));
  assert.ok(md.includes('one &amp; two'));
  assert.ok(md.includes('Racing') && !md.includes('Cozy'));
});

test('a README without the markers is refused rather than mangled', () => {
  assert.throws(() => withCabinets('# no markers here'), /missing the cabinets markers/);
});
