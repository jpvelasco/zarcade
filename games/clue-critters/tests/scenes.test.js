import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACE_ART, PROPS, layout, fitCore, CORE, TALL_CORE, SHORT_CORE } from '../src/scenes.js';
import { PLACES } from '../src/data.js';

const box = (s) => ({ x0: s.x - s.w / 2, x1: s.x + s.w / 2, y0: s.y - s.h, y1: s.y });
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

test('every place has art and six known props', () => {
  for (const p of PLACES) {
    const art = PLACE_ART[p.id];
    assert.ok(art, p.id);
    assert.equal(art.props.length, 6);
    for (const t of art.props) assert.ok(PROPS[t], t);
  }
});

for (const [name, tall, core] of [['wide', false, CORE], ['tall', true, TALL_CORE]]) {
  test(`${name} layouts keep props and the suspect apart and on screen`, () => {
    for (const p of PLACES) {
      const lay = layout(p.id, tall);
      const stand = { x0: lay.stand.x - 80, x1: lay.stand.x + 80, y0: lay.stand.y - 300, y1: lay.stand.y };
      lay.slots.forEach((s, i) => {
        const b = box(s);
        assert.ok(b.x0 >= core.x0 - 5 && b.x1 <= core.x1 + 5, `${p.id} slot ${i} inside x (${b.x0}..${b.x1})`);
        assert.ok(b.y0 >= core.top && b.y1 <= core.bottom, `${p.id} slot ${i} inside y`);
        assert.ok(s.w >= 90 && s.h >= 75, `${p.id} slot ${i} big enough to tap`);
        const hit = overlap(b, stand) / (s.w * s.h);
        assert.ok(hit < 0.2, `${p.id} slot ${i} clear of the suspect (${hit.toFixed(2)})`);
        lay.slots.forEach((o, j) => {
          if (j <= i) return;
          const shared = overlap(b, box(o)) / Math.min(s.w * s.h, o.w * o.h);
          assert.ok(shared < 0.15, `${p.id} slots ${i} and ${j} overlap ${shared.toFixed(2)}`);
        });
      });
    }
  });
}

test('the core fits wide, tall and short screens', () => {
  for (const [w, h] of [[1366, 784], [390, 712], [844, 300], [768, 948], [1920, 1000]]) {
    const f = fitCore(w, h);
    const c = f.tall ? TALL_CORE : h < w * 0.45 ? SHORT_CORE : CORE;
    const left = f.ox + c.x0 * f.s, right = f.ox + c.x1 * f.s;
    const top = f.oy + c.top * f.s, bottom = f.oy + c.bottom * f.s;
    assert.ok(left >= -1 && right <= w + 1, `${w}x${h} x fits`);
    assert.ok(top >= -1 && bottom <= h + 1, `${w}x${h} y fits`);
    assert.equal(f.tall, h > w * 1.25);
  }
});
