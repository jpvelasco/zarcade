import test from 'node:test';
import assert from 'node:assert/strict';

import { drawProp, PROP_ART_KEYS, hsl, shade, mixHex, alpha, vseq, parseColor } from '../src/art.js';
import { drawItem, drawSilhouette, drawGhost, drawCurio, drawArch, ITEM_ART_KEYS, CURIO_ART_KEYS, ARCH_KEYS } from '../src/sprites.js';
import { PROP_LIST } from '../src/props.js';
import { ITEMS } from '../src/items.js';
import { CURIOS } from '../src/curios.js';
import { GHOSTS } from '../src/ghosts.js';
import { ROOMS, sceneBox } from '../src/rooms.js';
import { buildScene } from '../src/scene.js';

// A canvas context that records instead of painting, so the drawing code can be
// exercised in Node. Anything the art uses that is missing here throws, which is
// the point.
function stubContext() {
  const calls = [];
  const gradient = { addColorStop() {} };
  const bad = [];
  const okColor = (v) => typeof v === 'object'
    || (typeof v === 'string' && !/NaN|undefined|null|Infinity/.test(v)) && (
    /^#[0-9a-f]{3,8}$/i.test(v)
    || /^(rgb|hsl)a?\([^)]*\)$/.test(v)
    || /^[a-z]+$/i.test(v));
  const ctx = {
    calls, bad,
    canvas: { width: 800, height: 600 },
    set fillStyle(v) { if (!okColor(v)) bad.push(`fillStyle=${v}`); this._fill = v; },
    get fillStyle() { return this._fill ?? '#000'; },
    set strokeStyle(v) { if (!okColor(v)) bad.push(`strokeStyle=${v}`); this._stroke = v; },
    get strokeStyle() { return this._stroke ?? '#000'; },
    set lineWidth(v) { if (!Number.isFinite(v) || v < 0) bad.push(`lineWidth=${v}`); this._lw = v; },
    get lineWidth() { return this._lw ?? 1; },
    set globalAlpha(v) { if (!Number.isFinite(v)) bad.push(`globalAlpha=${v}`); this._ga = v; },
    get globalAlpha() { return this._ga ?? 1; },
    font: '', textAlign: 'left', textBaseline: 'top', lineCap: 'butt',
    lineJoin: 'miter', globalCompositeOperation: 'source-over', filter: 'none',
    shadowBlur: 0, shadowColor: 'transparent',
    createLinearGradient() { calls.push('createLinearGradient'); return gradient; },
    createRadialGradient() { calls.push('createRadialGradient'); return gradient; },
    createPattern() { return null; },
    measureText(t) { return { width: String(t).length * 6 }; },
    getImageData() { return { data: new Uint8ClampedArray(4) }; },
  };
  for (const name of ['save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'arcTo', 'ellipse', 'rect',
    'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText',
    'setTransform', 'resetTransform', 'drawImage', 'setLineDash', 'transform']) {
    ctx[name] = (...args) => {
      calls.push(name);
      for (const a of args) {
        if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${name} got ${a}`);
      }
    };
  }
  return ctx;
}

test('colour helpers behave', () => {
  assert.equal(hsl(10, 20, 30), 'hsl(10 20% 30%)');
  assert.equal(hsl(10, 20, 30, 0.5), 'hsl(10 20% 30% / 0.5)');
  assert.equal(shade('#000000', 1), 'rgb(255 255 255)');
  assert.equal(shade('#ffffff', -1), 'rgb(0 0 0)');
  assert.equal(mixHex('#000000', '#ffffff', 0.5), 'rgb(128 128 128)');
  assert.equal(mixHex('#fff', '#000', 0), 'rgb(255 255 255)');
  assert.equal(alpha('#102030', 0.4), 'rgb(16 32 48 / 0.4)');
  const seq = vseq(12345);
  const first = [seq(), seq(), seq()];
  const again = vseq(12345);
  assert.deepEqual(first, [again(), again(), again()]);
  for (const v of first) assert.ok(v >= 0 && v < 1);
  assert.notEqual(vseq(1)(), vseq(2)());
  assert.ok(vseq(0)() >= 0, 'a zero seed still works');
});

test('shading works on hex, hsl and rgb alike, and never makes a bad colour', () => {
  assert.deepEqual(parseColor('#8a5a36'), [138, 90, 54]);
  assert.deepEqual(parseColor('#fff'), [255, 255, 255]);
  assert.deepEqual(parseColor('hsl(0 100% 50%)'), [255, 0, 0]);
  assert.deepEqual(parseColor('hsl(120 100% 50%)'), [0, 255, 0]);
  assert.deepEqual(parseColor('rgb(1 2 3)'), [1, 2, 3]);
  assert.deepEqual(parseColor('rgb(1 2 3 / 0.5)'), [1, 2, 3]);
  assert.deepEqual(parseColor('nonsense'), [0, 0, 0]);
  assert.deepEqual(parseColor(null), [0, 0, 0]);
  // The prop art shades colours it built with hsl(), so that must come back
  // as a real colour and not NaN.
  for (const col of ['#8a5a36', 'hsl(18 36% 45%)', 'rgb(20 30 40)', 'rgb(20 30 40 / 0.4)', hsl(200, 50, 40)]) {
    for (const amount of [-0.6, -0.1, 0.3, 0.9]) {
      const out = shade(col, amount);
      assert.doesNotMatch(out, /NaN/, `${col} @ ${amount} -> ${out}`);
      assert.match(out, /^rgb\(\d+ \d+ \d+\)$/);
    }
    assert.doesNotMatch(mixHex(col, '#ffffff', 0.4), /NaN/);
    assert.doesNotMatch(alpha(col, 0.5), /NaN/);
  }
});

test('every prop in the library has a drawing', () => {
  for (const p of PROP_LIST) {
    assert.ok(PROP_ART_KEYS.includes(p.id), `${p.id} has no art`);
  }
  assert.equal(PROP_ART_KEYS.length, PROP_LIST.length, 'art for a prop that does not exist');
});

test('every prop draws without complaining, flipped and not', () => {
  const pal = ROOMS[0].palette;
  for (const def of PROP_LIST) {
    for (const flip of [false, true]) {
      for (const tone of [0, 0.4, 0.99]) {
        const c = stubContext();
        drawProp(c, { def: def.id, x: 10, y: 20, w: 240, h: 180, tone, vr: 123456789, flip }, pal);
        assert.ok(c.calls.length > 2, `${def.id} drew almost nothing`);
        assert.deepEqual(c.bad, [], `${def.id} used a broken paint value`);
      }
    }
  }
  // An unknown prop is skipped rather than throwing.
  const c = stubContext();
  drawProp(c, { def: 'not-a-prop', x: 0, y: 0, w: 10, h: 10, tone: 0, vr: 1 }, pal);
  assert.equal(c.calls.length, 0);
});

test('every findable thing has a drawing and a silhouette', () => {
  for (const it of ITEMS) assert.ok(ITEM_ART_KEYS.includes(it.id), `${it.id} has no art`);
  assert.equal(ITEM_ART_KEYS.length, ITEMS.length);
  for (const it of ITEMS) {
    const c = stubContext();
    drawItem(c, it.id, it.w, it.h);
    assert.ok(c.calls.length > 2, `${it.id} drew almost nothing`);
    assert.deepEqual(c.bad, [], `${it.id} used a broken paint value`);
    const s = stubContext();
    drawSilhouette(s, it.id, it.w, it.h);
    assert.ok(s.calls.includes('fillRect'), `${it.id} has no silhouette`);
  }
  const empty = stubContext();
  drawItem(empty, 'nope', 10, 10);
  drawSilhouette(empty, 'nope', 10, 10);
  assert.equal(empty.calls.length, 0);
});

test('every ghost draws in both moods', () => {
  for (const g of GHOSTS) {
    for (const mood of [0, 0.5, 1]) {
      const c = stubContext();
      drawGhost(c, g, 120, 150, 1.7, mood);
      assert.deepEqual(c.bad, [], `${g.id} used a broken paint value`);
      assert.ok(c.calls.includes('createRadialGradient'), `${g.id} lost its halo`);
      assert.ok(c.calls.length > 10, `${g.id} drew almost nothing`);
    }
  }
  // An odd shape falls back rather than throwing.
  const c = stubContext();
  drawGhost(c, { ...GHOSTS[0], shape: 'wobbly' }, 100, 100, 0, 0.5);
  assert.ok(c.calls.length > 10);
});

test('every curio has a drawing', () => {
  for (const cu of CURIOS) assert.ok(CURIO_ART_KEYS.includes(cu.art), `${cu.id} has no art`);
  for (const cu of CURIOS) {
    const c = stubContext();
    drawCurio(c, cu.art, 90, 90, cu.tint);
    assert.ok(c.calls.length > 2, `${cu.id} drew almost nothing`);
    assert.deepEqual(c.bad, [], `${cu.id} used a broken paint value`);
  }
  const empty = stubContext();
  drawCurio(empty, 'nope', 10, 10, '#fff');
  assert.equal(empty.calls.length, 0);
});

test('every room shell has a drawing and uses no banned effects', () => {
  for (const room of ROOMS) assert.ok(ARCH_KEYS.includes(room.arch), `${room.id} has no architecture`);
  for (const room of ROOMS) {
    for (const light of [0, 1]) {
      const scene = buildScene({ room: room.id, mode: 'find', seed: 3, box: sceneBox(1280, 760) });
      const c = stubContext();
      drawArch(c, scene, light);
      assert.ok(c.calls.length > 20, `${room.id} drew almost nothing`);
      assert.deepEqual(c.bad, [], `${room.id} used a broken paint value`);
      assert.equal(c.shadowBlur, 0, `${room.id} used shadowBlur`);
      assert.equal(c.filter, 'none', `${room.id} used a filter`);
    }
  }
});

test('a whole scene paints without a single bad number', () => {
  for (const room of ROOMS) {
    const scene = buildScene({ room: room.id, mode: 'find', seed: 77, box: sceneBox(1366, 760) });
    const c = stubContext();
    drawArch(c, scene, 0.5);
    for (const p of scene.props) drawProp(c, p, scene.palette);
    for (const t of scene.targets) drawItem(c, t.id, t.w, t.h);
    assert.ok(c.calls.length > 200, `${room.id} looks suspiciously empty`);
    assert.deepEqual(c.bad, [], `${room.id} used a broken paint value`);
  }
});
