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

  // Scores one closed loop. `catches` is [{ color, kind }] where kind is
  // 'normal' | 'gold' | 'rainbow'. Gold and rainbow fireflies are wildcards.
  function scoreLoop(catches, streak) {
    const n = catches.length;
    if (n === 0) return { points: 0, harmony: false, streak, multiplier: 1, bonusTime: 0 };
    const colors = new Set(catches.filter((c) => c.kind === 'normal').map((c) => c.color));
    const bonusTime = 5 * catches.filter((c) => c.kind === 'gold').length;
    const harmony = n >= 2 && colors.size <= 1;
    const nextStreak = harmony ? streak + 1 : 0;
    const multiplier = harmony ? Math.min(3, 1 + 0.25 * (nextStreak - 1)) : 1;
    const base = harmony ? 10 * n * n : 10 * n;
    return { points: Math.round(base * multiplier), harmony, streak: nextStreak, multiplier, bonusTime };
  }

  function nightConfig(n) {
    return {
      duration: 60,
      target: 250 + 150 * (n - 1),
      fireflies: Math.min(30, 16 + 2 * (n - 1)),
      colors: n < 3 ? 3 : 4,
      thornbugs: Math.min(6, n - 1),
      speed: Math.min(95, 45 + 6 * (n - 1)),
      bugSpeed: Math.min(120, 55 + 8 * (n - 1)),
    };
  }

  function starsFor(score, target) {
    if (score >= target * 2) return 3;
    if (score >= target * 1.5) return 2;
    if (score >= target) return 1;
    return 0;
  }

  const Glow = {
    dist, segmentIntersection, pointInPolygon, polygonArea, centroid,
    findLoop, trimToLength, scoreLoop, nightConfig, starsFor,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Glow;
  else root.Glow = Glow;
})(typeof window !== 'undefined' ? window : globalThis);
