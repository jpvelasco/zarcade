import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDiff, diffHitTest, diffRemaining, diffHintArea, distanceToBox, CHANGE_TYPES, visibleProps } from '../src/modes.js';
import { ROOM_IDS, sceneBox, targetCount, sideBySide } from '../src/rooms.js';
import { autoplayDiff } from '../src/solver.js';

// Spot the Difference stacks two pictures, so a panel is half the height of
// the canvas: these are the boxes a 1366x820 desktop and a 390x614 phone give.
const BOXES = [sceneBox(1366, 410), sceneBox(1066, 407), sceneBox(390, 304), sceneBox(1366, 760)];
const SEEDS = [1, 2, 5, 9, 13, 21, 34, 88, 777];

function wanted(room, box) {
  return targetCount('diff', ROOM_IDS.indexOf(room), box.w);
}

test('every room makes the promised five to seven differences', () => {
  for (const room of ROOM_IDS) {
    for (const box of BOXES) {
      for (const seed of SEEDS) {
        const n = wanted(room, box);
        assert.ok(n >= 5 && n <= 7, `${room} asks for ${n}`);
        const diff = buildDiff({ room, seed, box, count: n });
        assert.equal(diff.changes.length, n, `${room} seed ${seed} box ${box.w}`);
        for (const c of diff.changes) {
          assert.ok(CHANGE_TYPES.includes(c.type), `odd change type ${c.type}`);
          assert.ok(c.box.w > 20 && c.box.h > 20, 'a difference must be big enough to see');
          assert.ok(c.box.x > -40 && c.box.x + c.box.w < box.w + 40, 'a difference must be on the picture');
        }
      }
    }
  }
});

test('the two pictures really are different, in exactly the marked places', () => {
  for (const room of ROOM_IDS) {
    for (const seed of SEEDS.slice(0, 5)) {
      const diff = buildDiff({ room, seed, box: BOXES[0], count: wanted(room, BOXES[0]) });
      const left = visibleProps(diff.left);
      const right = visibleProps(diff.right);
      const sig = (p) => `${p.def}:${Math.round(p.x)}:${Math.round(p.y)}:${Math.round(p.w)}:${p.tone.toFixed(3)}`;
      const leftSigs = left.map(sig);
      const rightSigs = right.map(sig);
      const changed = new Set();
      for (const s of leftSigs) if (!rightSigs.includes(s)) changed.add(s);
      for (const s of rightSigs) if (!leftSigs.includes(s)) changed.add(s);
      assert.ok(changed.size >= diff.changes.length, `${room} ${seed}: ${changed.size} visible edits for ${diff.changes.length} marks`);

      // Nothing outside a marked region may differ.
      for (const p of left) {
        if (rightSigs.includes(sig(p))) continue;
        const near = diff.changes.some((c) => distanceToBox(c.box, p.x + p.w / 2, p.y + p.h / 2) < Math.max(p.w, p.h));
        assert.ok(near, `${room} ${seed}: ${p.def} changed outside a marked region`);
      }
    }
  }
});

test('a click in the middle of a difference finds it', () => {
  for (const room of ROOM_IDS) {
    for (const seed of SEEDS.slice(0, 6)) {
      for (const box of BOXES) {
        const diff = buildDiff({ room, seed, box, count: wanted(room, BOXES[0]) });
        const report = autoplayDiff(diff);
        assert.ok(report.solved, `${room} ${seed} ${box.w}: missed ${report.missed}`);
        assert.equal(diffRemaining(diff), 0);
      }
    }
  }
});

test('differences are spread out and do not share a click', () => {
  for (const room of ROOM_IDS) {
    for (const seed of SEEDS) {
      const diff = buildDiff({ room, seed, box: BOXES[0], count: wanted(room, BOXES[0]) });
      for (let i = 0; i < diff.changes.length; i++) {
        for (let j = i + 1; j < diff.changes.length; j++) {
          const a = diff.changes[i];
          const b = diff.changes[j];
          assert.ok(Math.hypot(a.cx - b.cx, a.cy - b.cy) > 100, `${room} ${seed}: two differences in the same spot`);
          // Clicking one must not be ambiguous.
          assert.equal(diffHitTest(diff, a.cx, a.cy, 24).index, a.index);
        }
      }
    }
  }
});

test('a click in empty air finds no difference', () => {
  const diff = buildDiff({ room: 'ballroom', seed: 4, box: BOXES[0], count: 6 });
  let hits = 0;
  let tries = 0;
  for (let x = 10; x < diff.box.w; x += 53) {
    for (let y = 10; y < diff.box.h; y += 59) {
      tries++;
      if (diffHitTest(diff, x, y, 10)) hits++;
    }
  }
  assert.ok(hits < tries * 0.35, `${hits}/${tries} clicks landed on a difference`);
});

test('the difference hint points at the first unfound change', () => {
  const diff = buildDiff({ room: 'cellar', seed: 6, box: BOXES[0], count: 6 });
  const area = diffHintArea(diff);
  assert.equal(area.index, 0);
  assert.ok(area.r >= 165);
  for (const c of diff.changes) c.found = true;
  assert.equal(diffHintArea(diff), null);
});

test('the same seed makes the same pair of pictures', () => {
  const sig = (d) => JSON.stringify([
    d.left.map((p) => [p.def, Math.round(p.x), Math.round(p.y)]),
    d.right.map((p) => [p.def, Math.round(p.x), Math.round(p.y), !!p.gone]),
    d.changes.map((c) => [c.type, Math.round(c.cx), Math.round(c.cy)]),
  ]);
  const a = buildDiff({ room: 'greenhouse', seed: 77, box: BOXES[0], count: 6 });
  const b = buildDiff({ room: 'greenhouse', seed: 77, box: BOXES[0], count: 6 });
  const c = buildDiff({ room: 'greenhouse', seed: 78, box: BOXES[0], count: 6 });
  assert.equal(sig(a), sig(b));
  assert.notEqual(sig(a), sig(c));
});

test('a difference round carries no hidden things to collect', () => {
  const diff = buildDiff({ room: 'library', seed: 2, box: BOXES[0], count: 5 });
  assert.equal(diff.base.targets.length, 0);
  assert.equal(diff.base.mouse, null);
});

test('the two pictures stack on wide screens and sit side by side on a phone on its side', () => {
  assert.equal(sideBySide(1066, 860), false, 'desktop beside the list');
  assert.equal(sideBySide(390, 676), false, 'portrait phone');
  assert.equal(sideBySide(624, 390), true, '844x390 phone with the list on the right');
  assert.equal(sideBySide(844, 208), true, 'a short strip never gets two slices');
});
