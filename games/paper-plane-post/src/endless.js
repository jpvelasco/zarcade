// Endless Breeze: a valley that keeps going, folded from a seed.
//
// The ground stays at roughly one level, so height can only come from the warm
// columns. Early on they are generous and close together; past a kilometre they
// thin out, the rain comes in and the branches start reaching up. Fly well and
// you can keep going a long way.

import { makeTerrain } from './terrain.js';
import { band, gust, ridge, sunbeam, updraft, rain as raincloud } from './wind.js';
import { makeRng } from './rng.js';

export const CRUISE = 40;          // the height the rings are strung at
const SEGMENT = 170;               // metres of valley built at a time
export const AHEAD = 620;          // how far ahead the generator keeps working
const START_H = 62;

/** 0 at the start, 1 by 4 km: how hard the breeze is working against you. */
export function pressure(x) {
  return Math.min(1, Math.max(0, (x - 260) / 3700));
}

export const THEMES = [
  { id: 'soft', name: 'Soft Breeze', blurb: 'Gentle air and wide warm columns.', breeze: 1.4, lift: 1.1, wet: 0.7 },
  { id: 'tail', name: 'Tailwind Day', blurb: 'The wind is behind you the whole way.', breeze: 3.4, lift: 1, wet: 0.8 },
  { id: 'showers', name: 'Scattered Showers', blurb: 'Rain clouds drifting through the valley.', breeze: 1.2, lift: 1, wet: 1.6 },
  { id: 'thermal', name: 'Thermal Morning', blurb: 'Strong narrow columns. Dive into them.', breeze: 1, lift: 1.25, wet: 0.7 },
  { id: 'brisk', name: 'Brisk Northerly', blurb: 'A cool headwind and bumpy air.', breeze: -1.6, lift: 1.05, wet: 1 },
  { id: 'clear', name: 'Clear and Still', blurb: 'Barely a breath. Every metre counts.', breeze: 0.4, lift: 0.95, wet: 0.5 },
];

export const themeById = (id) => THEMES.find((theme) => theme.id === id) || THEMES[0];

/**
 * A growing scene. `ensure(x)` builds valley up to x; `trim(x)` forgets what is
 * well behind. The shape matches a route closely enough that `World` and the
 * autopilot do not care which one they are flying.
 */
export function makeEndless({ seed = 1, theme = 'soft', goal = 0 } = {}) {
  const mood = themeById(theme);
  const rng = makeRng(seed);
  const base = -18;
  const terrain = makeTerrain([[-200, base], [0, base], [120, base - 10]], { kind: 'grass' });
  const scene = {
    id: 'endless',
    endless: true,
    theme: mood.id,
    themeName: mood.name,
    goal,
    terrain,
    air: [],
    rings: [],
    drops: [],
    hazards: [],
    mailbox: null,
    softSpeed: 13,
    ceiling: -230,
    breeze: { x: mood.breeze, y: 0 },
    start: { x: 16, y: base - START_H, speed: 11.6, angle: 0.05 },
    built: 120,
    ringNo: 0,
    dropNo: 0,
  };

  let lastY = base - 10;
  let lastColumn = 60;
  let groundTo = 120;

  /**
   * The ground is always built further ahead than the things standing on it, so
   * a ring's height is never worked out from a stretch of valley that is about
   * to change shape.
   */
  function extendGround(toX) {
    while (groundTo < toX) {
      const hard = pressure(groundTo);
      const rough = 10 + 26 * rng.next() + 16 * hard;
      lastY = Math.max(base - 46, Math.min(base + 16, lastY + (rng.next() - 0.5) * rough));
      groundTo += SEGMENT;
      terrain.extend([[groundTo, Math.round(lastY)]]);
    }
  }

  function segment(x0) {
    const hard = pressure(x0);
    extendGround(x0 + SEGMENT * 3);

    // Warm columns: close and wide early, further apart and thinner later.
    const spacing = 150 + 90 * hard;
    while (lastColumn < x0 + SEGMENT) {
      const cx = lastColumn + spacing * (0.8 + rng.next() * 0.4);
      lastColumn = cx;
      const ground = terrain.heightAt(cx);
      const narrow = rng.chance(0.3 + 0.2 * hard);
      const strength = (narrow ? 8.4 : 5.6) * mood.lift * (1 - 0.22 * hard);
      const width = (narrow ? 15 : 27) * (1 - 0.14 * hard);
      scene.air.push(rng.chance(0.25)
        ? ridge(cx, ground - 2, 130, 44, strength * 0.8)
        : updraft(cx, ground - 2, 110 + 30 * rng.next(), width, strength));
      // A ring at the column and one between columns marks the line.
      scene.rings.push({ id: `e-r${scene.ringNo++}`, x: Math.round(cx), y: Math.round(ground - CRUISE - (narrow ? 8 : 0)), r: 9 });
      const midX = Math.round(cx + spacing * 0.5);
      scene.rings.push({ id: `e-r${scene.ringNo++}`, x: midX, y: Math.round(terrain.heightAt(midX) - CRUISE - 4), r: 9 });
      if (rng.chance(0.55)) {
        const dx = Math.round(cx + spacing * (0.2 + rng.next() * 0.5));
        scene.drops.push({
          id: `e-d${scene.dropNo++}`,
          x: dx,
          y: Math.round(terrain.heightAt(dx) - CRUISE + (rng.next() - 0.5) * 16),
          ground: terrain.heightAt(dx),
        });
      }
    }

    // Weather and clutter arrive as the run goes on.
    if (hard > 0.04 && rng.chance(0.2 + 0.4 * hard)) {
      const cx = x0 + SEGMENT * rng.next();
      const wet = Math.min(1, (0.5 + 0.5 * hard) * mood.wet);
      scene.air.push(raincloud(cx, terrain.heightAt(cx) - CRUISE - 4, 22 + 10 * rng.next(), 22, 3.6 + 1.2 * hard, { rain: wet }));
    }
    if (rng.chance(0.3)) {
      const cx = x0 + SEGMENT * rng.next();
      scene.air.push(sunbeam(cx, terrain.heightAt(cx) - CRUISE + 6, 26, 26, 2.8));
    }
    if (rng.chance(0.35 + 0.2 * hard)) {
      const cx = x0 + SEGMENT * rng.next();
      scene.air.push(rng.chance(0.5)
        ? band(cx, terrain.heightAt(cx) - CRUISE, 70, 24, 3.4 + 2 * rng.next())
        : gust(cx, terrain.heightAt(cx) - CRUISE, 70, 24, 3.8 + 2 * rng.next(), 3 + 2 * rng.next(), { phase: rng.next() }));
    }
    if (hard > 0.02 && rng.chance(0.25 + 0.55 * hard)) {
      const cx = Math.round(x0 + SEGMENT * rng.next());
      const ground = terrain.heightAt(cx);
      const above = rng.chance(0.5);
      scene.hazards.push(above
        ? { x: cx, y: Math.round(ground - CRUISE - 19), r: 6, kind: 'birds' }
        : { x: cx, y: Math.round(Math.max(ground - CRUISE + 19, ground - 14)), r: 6, kind: 'branch' });
    }
  }

  scene.ensure = (x) => {
    while (scene.built < x) {
      segment(scene.built);
      scene.built += SEGMENT;
    }
    return scene;
  };
  scene.trim = (x) => {
    terrain.trim(x - 200);
    const keep = (item) => item.x > x - 160;
    if (scene.rings.length > 120) scene.rings = scene.rings.filter(keep);
    if (scene.drops.length > 80) scene.drops = scene.drops.filter(keep);
    if (scene.hazards.length > 80) scene.hazards = scene.hazards.filter(keep);
    if (scene.air.length > 90) scene.air = scene.air.filter((source) => source.x > x - 240);
    return scene;
  };
  scene.ensure(AHEAD);
  return scene;
}
