import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScene, buildMask, distanceToMask, hitTest, hintArea, remaining,
  CELL, MIN_FRACTION, MIN_AREA, MIN_HIT_RADIUS, EDGE_MARGIN, targetGap,
} from '../src/scene.js';
import { ROOM_IDS, sceneBox, targetCount, MODE_IDS } from '../src/rooms.js';
import { ITEM } from '../src/items.js';
import { autoplay } from '../src/solver.js';
import { GHOST } from '../src/ghosts.js';

// Desktop wide, laptop, and a 390x844 phone with the item tray taking the
// bottom third: the three shapes the game actually has to work in.
const BOXES = [sceneBox(1366, 760), sceneBox(1060, 790), sceneBox(390, 560), sceneBox(3440, 1180)];
const SEEDS = [1, 2, 3, 7, 11, 23, 57, 101, 404, 9001];

test('buildMask marks what is covered and nothing else', () => {
  const box = { x: 0, y: 0, w: 80, h: 40 };
  const open = buildMask(box, []);
  assert.equal(open.fraction, 1);
  assert.equal(open.area, 80 * 40);

  const half = buildMask(box, [{ x: 40, y: 0, w: 40, h: 40 }]);
  assert.ok(Math.abs(half.fraction - 0.5) < 0.06, `half covered, got ${half.fraction}`);
  assert.ok(half.hit.x < 40, 'the hit point sits in the part that still shows');

  const all = buildMask(box, [{ x: -10, y: -10, w: 200, h: 200 }]);
  assert.equal(all.area, 0);
  assert.equal(all.hit.r, 0);
});

test('buildMask keeps only the largest connected patch', () => {
  // A bar straight down the middle splits the box into two 38-wide halves,
  // so only one of them may be called findable.
  const box = { x: 0, y: 0, w: 80, h: 40 };
  const split = buildMask(box, [{ x: 38, y: -5, w: 10, h: 50 }]);
  assert.ok(split.fraction < 0.55, `one half only, got ${split.fraction}`);
  assert.ok(split.fraction > 0.4);
});

test('distanceToMask is zero on the thing and grows away from it', () => {
  const mask = buildMask({ x: 100, y: 100, w: 60, h: 60 }, []);
  assert.equal(distanceToMask(mask, 130, 130), 0);
  const d = distanceToMask(mask, 200, 130);
  assert.ok(d > 35 && d < 46, `about 40 away, got ${d}`);
});

test('every hidden thing in every room is visible, clickable and in bounds', () => {
  let checked = 0;
  for (const room of ROOM_IDS) {
    for (const box of BOXES) {
      for (const seed of SEEDS) {
        const scene = buildScene({ room, mode: 'find', seed, box });
        for (const t of scene.targets) {
          checked++;
          const where = `${room} seed ${seed} box ${box.w} item ${t.id}`;
          assert.ok(t.mask.fraction >= MIN_FRACTION, `${where}: only ${t.mask.fraction.toFixed(2)} of it shows`);
          assert.ok(t.mask.area >= MIN_AREA, `${where}: visible area ${t.mask.area}`);
          assert.ok(t.hit.r >= MIN_HIT_RADIUS, `${where}: hit radius ${t.hit.r.toFixed(1)}`);
          assert.ok(t.x >= EDGE_MARGIN && t.y >= EDGE_MARGIN, `${where}: off the top left`);
          assert.ok(t.x + t.w <= box.w - EDGE_MARGIN, `${where}: off the right`);
          assert.ok(t.y + t.h <= box.h - EDGE_MARGIN, `${where}: off the bottom`);
          // The hit point is inside the thing and inside its visible part.
          assert.ok(t.hit.x > t.x && t.hit.x < t.x + t.w, `${where}: hit point outside the box`);
          assert.equal(distanceToMask(t.mask, t.hit.x, t.hit.y), 0, `${where}: hit point is covered`);
        }
      }
    }
  }
  assert.ok(checked > 1500, `checked ${checked} placements`);
});

test('hidden things never pile up on each other', () => {
  for (const room of ROOM_IDS) {
    for (const box of BOXES) {
      for (const seed of SEEDS) {
        const scene = buildScene({ room, mode: 'find', seed, box });
        const gap = targetGap(box.w);
        for (let i = 0; i < scene.targets.length; i++) {
          for (let j = i + 1; j < scene.targets.length; j++) {
            const a = scene.targets[i];
            const b = scene.targets[j];
            const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
            assert.ok(d >= gap * 0.55, `${room} ${seed}: ${a.id} and ${b.id} only ${d.toFixed(0)} apart`);
            const discs = Math.hypot(a.hit.x - b.hit.x, a.hit.y - b.hit.y);
            assert.ok(discs > a.hit.r + b.hit.r - 1, `${room} ${seed}: hit discs of ${a.id} and ${b.id} overlap`);
          }
        }
      }
    }
  }
});

test('a click in the middle of a thing finds that thing and no other', () => {
  for (const room of ROOM_IDS) {
    for (const box of BOXES) {
      for (const seed of SEEDS.slice(0, 6)) {
        const scene = buildScene({ room, mode: 'find', seed, box });
        const report = autoplay(scene);
        assert.ok(report.solved, `${room} ${seed}: ${JSON.stringify({ missed: report.missed, wrong: report.wrong })}`);
        assert.equal(remaining(scene), 0);
      }
    }
  }
});

test('clicks on a covered part of a thing do not count', () => {
  // Find a target that is genuinely half hidden, then click a covered cell.
  let tested = 0;
  outer: for (const room of ROOM_IDS) {
    for (const seed of SEEDS) {
      const scene = buildScene({ room, mode: 'find', seed, box: BOXES[0] });
      for (const t of scene.targets) {
        if (t.mask.fraction > 0.75) continue;
        const { cols, rows, bits } = t.mask;
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            if (bits[j * cols + i]) continue;
            const px = t.mask.x + (i + 0.5) * CELL;
            const py = t.mask.y + (j + 0.5) * CELL;
            if (distanceToMask(t.mask, px, py) <= 6) continue;
            assert.notEqual(hitTest(scene, px, py, 5), t, 'a covered cell answered a click');
            tested++;
            if (tested > 20) break outer;
          }
        }
      }
    }
  }
  assert.ok(tested > 0, 'expected at least one partly hidden thing to test');
});

test('a click in empty air finds nothing', () => {
  const scene = buildScene({ room: 'library', mode: 'find', seed: 5, box: BOXES[0] });
  let hits = 0;
  for (let x = 20; x < scene.box.w; x += 37) {
    for (let y = 20; y < scene.box.h; y += 41) {
      if (hitTest(scene, x, y, 18)) hits++;
    }
  }
  const cells = Math.ceil((scene.box.w - 20) / 37) * Math.ceil((scene.box.h - 20) / 41);
  assert.ok(hits < cells * 0.2, `a grid of clicks should mostly miss, hit ${hits}/${cells}`);
});

test('the same seed builds the same room, a different seed does not', () => {
  const a = buildScene({ room: 'attic', mode: 'find', seed: 42, box: BOXES[1] });
  const b = buildScene({ room: 'attic', mode: 'find', seed: 42, box: BOXES[1] });
  const c = buildScene({ room: 'attic', mode: 'find', seed: 43, box: BOXES[1] });
  const sig = (s) => JSON.stringify([
    s.props.map((p) => [p.def, Math.round(p.x), Math.round(p.y), Math.round(p.w), p.z]),
    s.targets.map((t) => [t.id, Math.round(t.x), Math.round(t.y), t.kind]),
  ]);
  assert.equal(sig(a), sig(b));
  assert.notEqual(sig(a), sig(c));
});

test('rooms ask for the right number of things, with the residents first', () => {
  for (const room of ROOM_IDS) {
    const scene = buildScene({ room, mode: 'find', seed: 8, box: BOXES[1] });
    const wanted = scene.wanted;
    assert.equal(wanted.length, targetCount('find', ROOM_IDS.indexOf(room)), room);
    assert.equal(new Set(wanted).size, wanted.length, `${room} asks for the same thing twice`);
    for (const t of scene.targets) {
      if (t.secret) continue;
      assert.ok(GHOST[t.owner], `${room}: ${t.id} has no owner`);
      assert.ok(ITEM[t.id].kinds.includes(t.kind) || t.rescued, `${room}: ${t.id} hidden in a ${t.kind}`);
    }
  }
});

test('the manor mouse turns up in find rounds and is never required', () => {
  let seen = 0;
  for (const room of ROOM_IDS) {
    for (const seed of SEEDS) {
      const scene = buildScene({ room, mode: 'find', seed, box: BOXES[1] });
      if (!scene.mouse) continue;
      seen++;
      assert.ok(scene.mouse.secret);
      assert.ok(!scene.wanted.includes('mouse'));
      const before = remaining(scene);
      scene.mouse.found = true;
      assert.equal(remaining(scene), before, 'the mouse must not count towards the list');
    }
  }
  assert.ok(seen > ROOM_IDS.length * 5, `the mouse should be common, saw ${seen}`);
});

test('silhouette rounds use the same machinery and are marked', () => {
  for (const room of ROOM_IDS) {
    const scene = buildScene({ room, mode: 'hunt', seed: 12, box: BOXES[1] });
    assert.equal(scene.silhouette, true);
    assert.equal(scene.targets.length, targetCount('hunt'));
    assert.equal(scene.mouse, null, 'no secret mouse in a silhouette hunt');
    assert.ok(autoplay(scene).solved);
  }
});

test('the hint lights up an area near the next thing, not the thing itself', () => {
  const scene = buildScene({ room: 'kitchen', mode: 'find', seed: 3, box: BOXES[1] });
  const area = hintArea(scene);
  const t = scene.targets.find((x) => x.id === area.id);
  const d = Math.hypot(area.x - t.cx, area.y - t.cy);
  assert.ok(d > 0 && d < area.r, `the hint should be near but off centre, got ${d}`);
  for (const x of scene.targets) x.found = true;
  assert.equal(hintArea(scene), null);
});

test('building every room in every mode is quick enough for one frame', () => {
  const t0 = process.hrtime.bigint();
  let built = 0;
  for (const room of ROOM_IDS) {
    for (const mode of MODE_IDS.filter((m) => m !== 'diff')) {
      for (const seed of SEEDS) { buildScene({ room, mode, seed, box: BOXES[0] }); built++; }
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms / built < 8, `${(ms / built).toFixed(2)} ms per scene`);
});
