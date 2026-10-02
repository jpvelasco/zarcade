// Pure game rules and geometry for Glowloop. No DOM access, so it runs in the
// browser (as window.Glow) and in Node (for tests).
(function (root) {
  'use strict';

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // Intersection point of segments ab and cd, or null if they don't cross.
  function segmentIntersection(a, b, c, d) {
    const rx = b.x - a.x, ry = b.y - a.y;
    const sx = d.x - c.x, sy = d.y - c.y;
    const denom = rx * sy - ry * sx;
    if (Math.abs(denom) < 1e-9) return null;
    const qx = c.x - a.x, qy = c.y - a.y;
    const t = (qx * sy - qy * sx) / denom;
    const u = (qx * ry - qy * rx) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: a.x + t * rx, y: a.y + t * ry };
  }

  function pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) &&
          p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  function polygonArea(poly) {
    let sum = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      sum += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
    }
    return Math.abs(sum) / 2;
  }

  function centroid(poly) {
    let x = 0, y = 0;
    for (const p of poly) { x += p.x; y += p.y; }
    return { x: x / poly.length, y: y / poly.length };
  }

  // Checks whether extending the trail to `next` closes a loop. Searches from
  // the newest segment backwards so the smallest, most recent loop wins.
  // Returns { point, polygon } or null.
  function findLoop(points, next) {
    const n = points.length;
    if (n < 3) return null;
    const last = points[n - 1];
    for (let i = n - 3; i >= 0; i--) {
      const hit = segmentIntersection(last, next, points[i], points[i + 1]);
      if (hit) return { point: hit, polygon: [hit, ...points.slice(i + 1, n)] };
    }
    return null;
  }

  // Predicts the loop the player is about to close: if the trail's tip has come
  // back within `reach` of an earlier point (at least `minGap` points back),
  // returns the trail from that point onward as a polygon, else null.
  function pendingLoop(points, reach, minGap) {
    const n = points.length;
    if (n < minGap + 2) return null;
    const tip = points[n - 1];
    let best = -1, bestD = reach;
    for (let i = 0; i < n - minGap; i++) {
      const d = dist(points[i], tip);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best < 0 ? null : points.slice(best);
  }

  // When the finger lifts just short of closing a loop, close it anyway: the
  // tip must be within `reach` of an earlier point, the gap must be small next
  // to the loop's length, and the loop must enclose at least `minArea`.
  // Returns the polygon or null.
  function releaseLoop(points, reach, minGap, minArea) {
    const poly = pendingLoop(points, reach, minGap);
    if (!poly || polygonArea(poly) < minArea) return null;
    let length = 0;
    for (let i = 1; i < poly.length; i++) length += dist(poly[i - 1], poly[i]);
    if (dist(poly[0], poly[poly.length - 1]) > length * 0.25) return null;
    return poly;
  }

  // Drops points from the start of the trail until its length fits maxLength.
  function trimToLength(points, maxLength) {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
    while (points.length > 2 && total > maxLength) {
      total -= dist(points[0], points[1]);
      points.shift();
    }
    return points;
  }

  const isWild = (kind) => kind === 'gold' || kind === 'rainbow';

  // How many fireflies one catch counts as.
  const WEIGHTS = { shy: 2, twin: 1.5, queen: 5 };
  function weightOf(kind) {
    return WEIGHTS[kind] || 1;
  }

  // The Harmony multiplier for a streak of `streak` back-to-back Harmonies:
  // ×1, ×1.25, ×1.5 … capped at ×3.
  function streakMultiplier(streak) {
    return streak > 1 ? Math.min(3, 1 + 0.25 * (streak - 1)) : 1;
  }

  // Scores one closed loop. `catches` is [{ color, kind }]. Gold and rainbow
  // fireflies are wildcards; every other kind contributes its color.
  function scoreLoop(catches, streak) {
    if (catches.length === 0) return { points: 0, harmony: false, streak, multiplier: 1, bonusTime: 0 };
    const n = catches.reduce((sum, c) => sum + weightOf(c.kind), 0);
    const colors = new Set(catches.filter((c) => !isWild(c.kind)).map((c) => c.color));
    const bonusTime = 5 * catches.filter((c) => c.kind === 'gold').length;
    const harmony = n >= 2 && colors.size <= 1;
    const nextStreak = harmony ? streak + 1 : 0;
    const multiplier = harmony ? streakMultiplier(nextStreak) : 1;
    const base = harmony ? 10 * n * n : 10 * n;
    return { points: Math.round(base * multiplier), harmony, streak: nextStreak, multiplier, bonusTime };
  }

  const TWISTS = ['wind', 'blackout', 'swarm'];
  // Nights 4-9 each introduce one new creature or twist; from night 10 on,
  // every night rotates through the twists.
  const SCHEDULE = { 4: 'shy', 5: 'wind', 6: 'twins', 7: 'blackout', 8: 'queen', 9: 'swarm' };
  const TARGET_SCALE = { wind: 0.9, blackout: 0.8, swarm: 1.2 };

  function twistFor(n) {
    if (n >= 10) return TWISTS[(n - 10) % TWISTS.length];
    return TWISTS.includes(SCHEDULE[n]) ? SCHEDULE[n] : null;
  }

  function nightConfig(n) {
    const twist = twistFor(n);
    const swarm = twist === 'swarm';
    return {
      duration: 60,
      target: Math.round(((250 + 150 * (n - 1)) * (TARGET_SCALE[twist] || 1)) / 10) * 10,
      fireflies: Math.round(Math.min(30, 16 + 2 * (n - 1)) * (swarm ? 1.6 : 1)),
      colors: n < 3 ? 3 : 4,
      thornbugs: Math.min(5, Math.round((n - 1) * 0.6)),
      speed: Math.min(95, 45 + 6 * (n - 1)) * (swarm ? 1.15 : 1),
      bugSpeed: Math.min(120, 55 + 8 * (n - 1)),
      twist,
      shy: n >= 4,
      twins: n >= 6,
      queen: n >= 8,
      fresh: SCHEDULE[n] || null, // what this night introduces, for the banner
    };
  }

  function starsFor(score, target) {
    if (score >= target * 2) return 3;
    if (score >= target * 1.5) return 2;
    if (score >= target) return 1;
    return 0;
  }

  // Keeps only sane values from a stored save; anything damaged falls back to
  // the default, so the title never offers a night that can't be played.
  function cleanSave(raw) {
    const save = { bestNight: 0, bestTotal: 0, muted: false };
    if (!raw || typeof raw !== 'object') return save;
    const count = (v) => Number.isSafeInteger(v) && v >= 0;
    if (count(raw.bestNight) && raw.bestNight < 10000) save.bestNight = raw.bestNight;
    if (count(raw.bestTotal)) save.bestTotal = raw.bestTotal;
    save.muted = raw.muted === true;
    return save;
  }

  const Glow = {
    dist, segmentIntersection, pointInPolygon, polygonArea, centroid,
    findLoop, pendingLoop, releaseLoop, trimToLength, weightOf, streakMultiplier, scoreLoop, twistFor, nightConfig, starsFor,
    cleanSave,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Glow;
  else root.Glow = Glow;
})(typeof window !== 'undefined' ? window : globalThis);
