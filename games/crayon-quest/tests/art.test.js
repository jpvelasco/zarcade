import test from 'node:test';
import assert from 'node:assert/strict';
import { BOIL_FRAMES, crossOutSVG, frameSVG, heroSVG, iconNames, iconSVG, letterSpans, monsterSVG } from '../src/art.js';
import { HEROES, MONSTERS } from '../src/data.js';

const clean = (svg) => !/NaN|undefined|Infinity/.test(svg);

test('every monster and hero draws three boil frames, deterministically', () => {
  for (const m of MONSTERS) {
    const svg = monsterSVG(m.id);
    assert.ok(clean(svg), m.id);
    assert.equal((svg.match(/class="f f\d"/g) || []).length, BOIL_FRAMES, m.id);
    assert.equal(svg, monsterSVG(m.id));
  }
  for (const h of HEROES) {
    for (const pose of ['idle', 'attack']) assert.ok(clean(heroSVG(h.id, { pose })), h.id);
    assert.match(heroSVG(h.id, { silhouette: true }), /class="silhouette"/);
  }
});

test('boil frames differ so the lines wobble', () => {
  const svg = monsterSVG('blob');
  const frames = svg.split('<g class="f f').slice(1);
  assert.notEqual(frames[0].slice(2), frames[1].slice(2));
});

test('icons, frames and lettering render', () => {
  for (const name of iconNames()) {
    const svg = iconSVG(name);
    assert.ok(clean(svg) && svg.includes('<path'), name);
  }
  assert.ok(clean(frameSVG('#e53958', 1, { fill: '#fff' })));
  assert.ok(crossOutSVG(3).includes('pathLength'));
  assert.equal((letterSpans('Crayon').match(/<span/g) || []).length, 6);
});
