// Moonshot Mini Golf: scoring words, stars, unlocks and the save file.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MoonshotRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SAVE_KEY = 'moonshot-golf.v1';

  // Word and mood for a finished hole. `tier` drives the celebration size.
  function scoreName(strokes, par, pickedUp = false) {
    if (pickedUp) return { text: 'Picked up', tier: 0, short: 'Pick up' };
    if (strokes === 1) return { text: 'Hole in one!', tier: 4, short: 'Ace' };
    const d = strokes - par;
    if (d <= -3) return { text: 'Albatross!', tier: 4, short: 'Albatross' };
    if (d === -2) return { text: 'Eagle!', tier: 3, short: 'Eagle' };
    if (d === -1) return { text: 'Birdie!', tier: 2, short: 'Birdie' };
    if (d === 0) return { text: 'Par. Nice!', tier: 1, short: 'Par' };
    if (d === 1) return { text: 'Bogey', tier: 0, short: 'Bogey' };
    if (d === 2) return { text: 'Double bogey', tier: 0, short: 'Double' };
    return { text: `+${d}`, tier: 0, short: `+${d}` };
  }

  // 3 stars under par, 2 at par, 1 for one over. Picking up earns none.
  function starsFor(strokes, par, pickedUp = false) {
    if (pickedUp || !strokes) return 0;
    const d = strokes - par;
    return d < 0 ? 3 : d === 0 ? 2 : d === 1 ? 1 : 0;
  }

  function freshSave() {
    return { v: 1, muted: false, best: {}, rounds: {}, completed: {} };
  }

  function loadSave(storage) {
    try {
      const raw = storage && storage.getItem(SAVE_KEY);
      if (!raw) return freshSave();
      const d = JSON.parse(raw);
      if (!d || d.v !== 1) return freshSave();
      return {
        v: 1,
        muted: !!d.muted,
        best: obj(d.best),
        rounds: obj(d.rounds),
        completed: obj(d.completed),
      };
    } catch {
      return freshSave();
    }
  }

  function obj(x) {
    return x && typeof x === 'object' && !Array.isArray(x) ? { ...x } : {};
  }

  function writeSave(storage, save) {
    try { storage && storage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage full or blocked */ }
  }

  // Record a finished hole. Returns stars and whether it beat the old best.
  function recordHole(save, hole, strokes, pickedUp = false) {
    const prev = save.best[hole.id];
    const newBest = !pickedUp && (prev === undefined || strokes < prev);
    if (newBest) save.best[hole.id] = strokes;
    return { stars: starsFor(strokes, hole.par, pickedUp), newBest, prev };
  }

  function recordRound(save, worldId, total) {
    const prev = save.rounds[worldId];
    const newBest = prev === undefined || total < prev;
    if (newBest) save.rounds[worldId] = total;
    save.completed[worldId] = true;
    return { newBest, prev };
  }

  // World 0 is always open; each later world opens when the previous
  // world's round has been finished once.
  function isWorldUnlocked(save, worlds, index) {
    if (index <= 0) return true;
    return !!save.completed[worlds[index - 1].id];
  }

  function worldStars(save, holes) {
    let n = 0;
    for (const h of holes) {
      const b = save.best[h.id];
      if (b !== undefined) n += starsFor(b, h.par);
    }
    return n;
  }

  return { SAVE_KEY, scoreName, starsFor, freshSave, loadSave, writeSave, recordHole, recordRound, isWorldUnlocked, worldStars };
});
